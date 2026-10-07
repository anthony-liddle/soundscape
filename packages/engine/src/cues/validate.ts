import { CUE_FORMAT, CUE_VERSION } from './types';
import type { CueDocument, CueProblem, CueValidation } from './types';
import { envelopeAndFilterProblems } from '../utils/validation';

/**
 * Validation for cue documents. Stricter than the state validator, on purpose:
 * a cue is meant to sound the same everywhere, so anything the engine would
 * have to guess at, ignore or repair is rejected instead, with the path to the
 * value that caused it.
 */

/** Names and ids: letters, digits, dash and underscore, starting with a letter or digit. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const TOP_KEYS = ['format', 'version', 'instruments', 'cues'];
const CUE_KEYS = ['notes'];
const NOTE_KEYS = ['id', 'instrument', 'start', 'duration', 'pitch', 'level'];

const WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];
const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch', 'none'];
const LFO_TARGETS = ['filter', 'pitch'];
const ENVELOPE_CURVES = ['linear', 'exponential'];

/** Instrument fields mapped from 0 to 1 by the engine. */
const NORMALIZED = [
  'attack',
  'decay',
  'sustain',
  'release',
  'filterCutoff',
  'filterResonance',
  'delayTime',
  'delayFeedback',
  'delayMix',
  'distortion',
  'lfoRate',
  'lfoDepth',
  'unisonDetune',
];
/** Instrument fields a cue fixes at 0. See CueInstrument. */
const FIXED_AT_ZERO: Record<string, string> = {
  reverbMix: "must be 0: the reverb's impulse response is random, and a cue must sound the same every time",
  velocityResponse: "must be 0: a cue note's level is its peak, and velocity plays no part",
};
const ENUMS: Record<string, string[]> = {
  waveform: WAVEFORMS,
  filterType: FILTER_TYPES,
  lfoTarget: LFO_TARGETS,
  envelopeCurve: ENVELOPE_CURVES,
};
/** Every instrument key. envelopeFloor is present exactly when the curve is exponential. */
const INSTRUMENT_KEYS = [
  'waveform',
  'pitchOffset',
  ...NORMALIZED,
  ...Object.keys(FIXED_AT_ZERO),
  'filterType',
  'lfoTarget',
  'envelopeCurve',
];

const join = (base: string, key: string): string => (base ? `${base}.${key}` : key);
const own = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Checker {
  readonly problems: CueProblem[] = [];

  add(path: string, message: string): void {
    this.problems.push({ path, message });
  }

  /** Reject any key outside `allowed`, and require each of `required`. */
  keys(value: Record<string, unknown>, base: string, allowed: string[], required: string[] = allowed): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.add(join(base, key), 'is not a key a cue document can have');
    }
    for (const key of required) {
      if (!own(value, key)) this.add(join(base, key), 'is required');
    }
  }

  /** A finite number in range, or a problem. Returns it if usable. */
  number(
    value: Record<string, unknown>,
    key: string,
    base: string,
    inRange: (n: number) => boolean,
    range: string
  ): number | undefined {
    if (!own(value, key)) return undefined;
    const n = value[key];
    if (typeof n !== 'number') {
      this.add(join(base, key), 'must be a number');
      return undefined;
    }
    if (!Number.isFinite(n) || !inRange(n)) {
      this.add(join(base, key), `must be ${range}`);
      return undefined;
    }
    return n;
  }

  name(name: string, path: string): void {
    if (!NAME.test(name)) {
      this.add(path, 'must be letters, digits, dash or underscore, starting with a letter or digit');
    }
  }
}

function checkInstrument(c: Checker, value: unknown, base: string): void {
  if (!isRecord(value)) {
    c.add(base, 'must be an object');
    return;
  }
  // decay is required unless decayUntilRelease stands in for it, and never
  // beside it, where its value would go unread
  const untilRelease = value.decayUntilRelease === true;
  c.keys(
    value,
    base,
    [...INSTRUMENT_KEYS, 'envelopeFloor', 'decayUntilRelease'],
    INSTRUMENT_KEYS.filter((key) => key !== 'decay')
  );
  if (own(value, 'decayUntilRelease') && !untilRelease) {
    c.add(join(base, 'decayUntilRelease'), 'must be true, or left out for a decay of fixed length');
  }
  if (untilRelease && own(value, 'decay')) {
    c.add(join(base, 'decay'), "must be left out: decayUntilRelease makes the decay last until each note's release");
  } else if (!untilRelease && !own(value, 'decay')) {
    c.add(join(base, 'decay'), 'is required, unless decayUntilRelease is true');
  }
  for (const [key, options] of Object.entries(ENUMS)) {
    if (own(value, key) && !options.includes(value[key] as string)) {
      c.add(join(base, key), `must be one of ${options.map((o) => `'${o}'`).join(', ')}`);
    }
  }
  c.number(value, 'pitchOffset', base, (n) => n >= -24 && n <= 24, 'a number of semitones from -24 to 24');
  for (const key of NORMALIZED) c.number(value, key, base, (n) => n >= 0 && n <= 1, 'from 0 to 1');
  for (const [key, why] of Object.entries(FIXED_AT_ZERO)) {
    if (own(value, key) && value[key] !== 0) c.add(join(base, key), why);
  }
  // The rules every instrument follows, shared with the state validator
  for (const p of envelopeAndFilterProblems(value)) c.add(join(base, p.key), p.message);
}

function checkNote(
  c: Checker,
  value: unknown,
  base: string,
  instruments: Record<string, unknown> | null,
  ids: Map<string, string>
): void {
  if (!isRecord(value)) {
    c.add(base, 'must be an object');
    return;
  }
  c.keys(value, base, NOTE_KEYS);

  if (own(value, 'id')) {
    const id = value.id;
    if (typeof id !== 'string') c.add(join(base, 'id'), 'must be a string');
    else {
      c.name(id, join(base, 'id'));
      const first = ids.get(id);
      if (first) c.add(join(base, 'id'), `duplicates the id at ${first}`);
      else ids.set(id, join(base, 'id'));
    }
  }

  // Look the instrument up as an own property only, so 'toString' cannot be
  // found on Object.prototype. Skipped when the instruments themselves are
  // missing, since there is nothing to check against.
  let instrument: Record<string, unknown> | null = null;
  if (own(value, 'instrument') && instruments) {
    const name = value.instrument;
    if (typeof name !== 'string' || !own(instruments, name)) {
      c.add(join(base, 'instrument'), 'must name an instrument this document defines');
    } else if (isRecord(instruments[name])) {
      instrument = instruments[name] as Record<string, unknown>;
    }
  }

  c.number(value, 'start', base, (n) => n >= 0, 'seconds, 0 or more');
  c.number(value, 'duration', base, (n) => n > 0, 'seconds, more than 0');
  c.number(value, 'pitch', base, (n) => n >= 0 && n <= 127, 'a MIDI pitch from 0 to 127');
  const level = c.number(value, 'level', base, (n) => n > 0 && n <= 1, 'a linear gain above 0 and at most 1');

  const floor = instrument?.envelopeFloor;
  if (level !== undefined && instrument?.envelopeCurve === 'exponential' && typeof floor === 'number' && level <= floor) {
    c.add(join(base, 'level'), `must be above its instrument's envelopeFloor of ${floor}`);
  }
}

/**
 * Validate a parsed cue document. Every problem is reported, not just the
 * first. A duplicate key in the JSON text cannot be seen here, because
 * JSON.parse has already kept only the last one; {@link parseCueDocument}
 * catches those too.
 */
export function validateCueDocument(value: unknown): CueValidation {
  const c = new Checker();
  if (!isRecord(value)) {
    c.add('', 'must be a JSON object');
    return { ok: false, problems: c.problems };
  }
  c.keys(value, '', TOP_KEYS);
  if (own(value, 'format') && value.format !== CUE_FORMAT) {
    c.add('format', `must be '${CUE_FORMAT}'`);
  }
  if (own(value, 'version') && value.version !== CUE_VERSION) {
    c.add('version', `${JSON.stringify(value.version)} is not a version this engine reads; it reads ${CUE_VERSION}`);
  }

  let instruments: Record<string, unknown> | null = null;
  if (own(value, 'instruments')) {
    if (!isRecord(value.instruments)) c.add('instruments', 'must be an object of instruments by name');
    else {
      instruments = value.instruments;
      for (const [name, instrument] of Object.entries(instruments)) {
        c.name(name, join('instruments', name));
        checkInstrument(c, instrument, join('instruments', name));
      }
    }
  }

  if (own(value, 'cues')) {
    if (!isRecord(value.cues)) c.add('cues', 'must be an object of cues by name');
    else {
      const ids = new Map<string, string>();
      for (const [name, cue] of Object.entries(value.cues)) {
        const base = join('cues', name);
        c.name(name, base);
        if (!isRecord(cue)) {
          c.add(base, 'must be an object');
          continue;
        }
        c.keys(cue, base, CUE_KEYS);
        if (!own(cue, 'notes')) continue;
        if (!Array.isArray(cue.notes)) {
          c.add(join(base, 'notes'), 'must be an array of notes');
          continue;
        }
        cue.notes.forEach((note, i) => checkNote(c, note, `${base}.notes[${i}]`, instruments, ids));
      }
    }
  }

  return c.problems.length === 0
    ? { ok: true, document: value as unknown as CueDocument }
    : { ok: false, problems: c.problems };
}

/**
 * Parse and validate a cue document from its JSON text. Also rejects a key
 * that appears twice in one object, which JSON.parse would silently resolve
 * by keeping the last.
 */
export function parseCueDocument(json: string): CueValidation {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return { ok: false, problems: [{ path: '', message: `is not valid JSON: ${(error as Error).message}` }] };
  }
  const duplicates: CueProblem[] = duplicateKeys(json).map((path) => ({
    path,
    message: 'appears more than once in its object; JSON would keep only the last',
  }));
  const result = validateCueDocument(value);
  const problems = [...duplicates, ...(result.ok ? [] : result.problems)];
  return problems.length === 0 ? result : { ok: false, problems };
}

type Frame =
  | { kind: 'object'; path: string; keys: Set<string>; key: string; expectKey: boolean }
  | { kind: 'array'; path: string; index: number };

/** Paths of keys that repeat within one object, scanned from valid JSON text. */
function duplicateKeys(text: string): string[] {
  const found: string[] = [];
  const stack: Frame[] = [];
  const childPath = (): string => {
    const top = stack[stack.length - 1];
    if (!top) return '';
    return top.kind === 'object' ? join(top.path, top.key) : `${top.path}[${top.index}]`;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top?.kind === 'object' && top.expectKey) {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        if (top.keys.has(key)) found.push(join(top.path, key));
        top.keys.add(key);
        top.key = key;
        top.expectKey = false;
      }
      i = j;
    } else if (ch === '{') {
      stack.push({ kind: 'object', path: childPath(), keys: new Set(), key: '', expectKey: true });
    } else if (ch === '[') {
      stack.push({ kind: 'array', path: childPath(), index: 0 });
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    } else if (ch === ',') {
      const top = stack[stack.length - 1];
      if (top?.kind === 'object') top.expectKey = true;
      else if (top) top.index++;
    }
  }
  return found;
}
