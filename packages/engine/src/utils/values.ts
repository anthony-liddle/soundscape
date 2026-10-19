import { soundscapeInstrumentProblems } from './validation';
import type { InstrumentProblem } from './validation';

/**
 * The values a song can hold that cannot play, found as they arrive at the
 * engine's runtime API, which refuses them with every problem's path before
 * changing anything. updateState throws. A call made while the music plays,
 * updateMixer, previewNote, startMIDINote, setTempo or setLoopLength, skips
 * what it was asked and reports it instead, so it never throws into its
 * caller. A file's validator is not the only way in: a host can hand over a
 * bad value at any time.
 */

/** Instrument fields the engine maps from 0 to 1. A cue instrument's are held to the same range. */
export const NORMALIZED_PARAMS = [
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
] as const;

/** Two more a song's instrument can set from 0 to 1, where a cue's must be 0. */
const SONG_NORMALIZED_PARAMS = ['reverbMix', 'velocityResponse'] as const;

/** The pitch offset, in semitones: two octaves either way. */
export const PITCH_OFFSET_RANGE = { min: -24, max: 24 } as const;

/** The values each enumerated instrument field can take. */
export const PARAM_CHOICES = {
  waveform: ['sine', 'square', 'sawtooth', 'triangle'],
  filterType: ['lowpass', 'highpass', 'bandpass', 'notch', 'none'],
  lfoTarget: ['filter', 'pitch'],
  envelopeCurve: ['linear', 'exponential'],
} as const;

/** One value that cannot play, the path to it, and the track it is on, if any. */
export interface ValueProblem extends InstrumentProblem {
  track?: string | undefined;
}

/**
 * The runtime API's refusal, listing every value that cannot play: thrown by
 * updateState, and reported by a call made while the music plays.
 */
export class SoundscapeValueError extends RangeError {
  readonly problems: ValueProblem[];
  constructor(call: string, problems: ValueProblem[]) {
    super(
      `${call} refused, since these values cannot play:\n` +
        problems.map((p) => `  ${p.path}${p.track === undefined ? '' : `, on track '${p.track}'`}: ${p.message}`).join('\n')
    );
    this.name = 'SoundscapeValueError';
    this.problems = problems;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const own = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);

/** A value, as a message can quote it: NaN stays NaN, and a string keeps its quotes. */
const quote = (value: unknown): string => (typeof value === 'string' ? `'${value}'` : String(value));

/** A finite number in range at `key`, if `values` has one there, or its problem. */
function checkNumber(
  problems: ValueProblem[],
  values: Record<string, unknown>,
  key: string,
  base: string,
  inRange: (n: number) => boolean,
  range: string,
  track?: string
): void {
  if (!own(values, key)) return;
  const value = values[key];
  const path = base ? `${base}.${key}` : key;
  if (typeof value !== 'number') problems.push({ path, message: `must be a number, got ${quote(value)}`, track });
  else if (!Number.isFinite(value) || !inRange(value)) problems.push({ path, message: `must be ${range}, got ${value}`, track });
}

/**
 * Each value in an instrument's params or overrides that cannot play: a
 * number that is not finite or out of its range, or a choice that is not one
 * of its own. Keys that are not there are not looked for, so partial
 * overrides are checked as they stand. Rules between fields are checked on
 * the instrument a track plays, by soundscapeInstrumentProblems.
 */
export function instrumentValueProblems(params: unknown, base: string, track?: string): ValueProblem[] {
  if (params === undefined) return [];
  if (!isRecord(params)) return [{ path: base, message: 'must be an object', track }];
  const problems: ValueProblem[] = [];
  const { min, max } = PITCH_OFFSET_RANGE;
  checkNumber(problems, params, 'pitchOffset', base, (n) => n >= min && n <= max, `a number of semitones from ${min} to ${max}`, track);
  for (const key of [...NORMALIZED_PARAMS, ...SONG_NORMALIZED_PARAMS]) {
    checkNumber(problems, params, key, base, (n) => n >= 0 && n <= 1, 'from 0 to 1', track);
  }
  for (const [key, choices] of Object.entries(PARAM_CHOICES)) {
    if (own(params, key) && !(choices as readonly unknown[]).includes(params[key])) {
      problems.push({ path: `${base}.${key}`, message: `must be one of ${choices.map((c) => `'${c}'`).join(', ')}, got ${quote(params[key])}`, track });
    }
  }
  return problems;
}

/** Each mixer value that cannot play: a volume that is not finite or not from 0 to 1, or a mute or solo that is not a boolean. */
export function mixerValueProblems(mixer: unknown, base = 'mixer'): ValueProblem[] {
  if (!isRecord(mixer)) return [{ path: base, message: 'must be an object' }];
  const problems: ValueProblem[] = [];
  checkNumber(problems, mixer, 'masterVolume', base, (n) => n >= 0 && n <= 1, 'from 0 to 1');
  if (own(mixer, 'tracks')) {
    if (!isRecord(mixer.tracks)) problems.push({ path: `${base}.tracks`, message: 'must be an object' });
    else {
      for (const [id, entry] of Object.entries(mixer.tracks)) {
        problems.push(...trackMixerValueProblems(entry, `${base}.tracks.${id}`, id));
      }
    }
  }
  return problems;
}

/** Each value in one track's mixer entry that cannot play. */
export function trackMixerValueProblems(entry: unknown, base: string, track?: string): ValueProblem[] {
  if (!isRecord(entry)) return [{ path: base, message: 'must be an object', track }];
  const problems: ValueProblem[] = [];
  checkNumber(problems, entry, 'volume', base, (n) => n >= 0 && n <= 1, 'from 0 to 1', track);
  for (const key of ['mute', 'solo']) {
    if (own(entry, key) && typeof entry[key] !== 'boolean') {
      problems.push({ path: `${base}.${key}`, message: `must be true or false, got ${quote(entry[key])}`, track });
    }
  }
  return problems;
}

/** A tempo that cannot play: anything but a finite number of beats a minute above 0. */
export function tempoValueProblems(bpm: unknown, path = 'bpm'): ValueProblem[] {
  const problems: ValueProblem[] = [];
  checkNumber(problems, { [path]: bpm }, path, '', (n) => n > 0, 'a tempo above 0 beats a minute');
  return problems;
}

/** A loop length that cannot play: anything but a finite number of beats above 0. */
export function loopLengthValueProblems(beats: unknown, path = 'beats'): ValueProblem[] {
  const problems: ValueProblem[] = [];
  checkNumber(problems, { [path]: beats }, path, '', (n) => n > 0, 'a length above 0 beats');
  return problems;
}

/**
 * Reports what was skipped, rather than throw into a caller while the music
 * plays: through reportError where the host has it, as a browser does, or
 * else console.error, so it is seen and the music carries on.
 */
export function reportSkipped(error: Error): void {
  const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
  if (typeof report === 'function') report.call(globalThis, error);
  else console.error(error);
}

/** A note's pitch and velocity, as previewNote and startMIDINote take them. */
export function pitchAndVelocityProblems(pitch: unknown, velocity: unknown): ValueProblem[] {
  const problems: ValueProblem[] = [];
  const values = { pitch, velocity };
  checkNumber(problems, values, 'pitch', '', (n) => n >= 0 && n <= 127, 'a MIDI pitch from 0 to 127');
  checkNumber(problems, values, 'velocity', '', (n) => n >= 0 && n <= 127, 'a velocity from 0 to 127');
  return problems;
}

/**
 * Every value in a state that cannot play, as updateState finds it: the
 * tempo and length, each preset's params and each track's overrides, every
 * note, the rules between an instrument's fields, and the mixer.
 */
export function stateValueProblems(state: unknown): ValueProblem[] {
  if (!isRecord(state)) return [{ path: '', message: 'must be an object' }];
  const problems: ValueProblem[] = [];
  const metadata = isRecord(state.metadata) ? state.metadata : {};
  if (own(metadata, 'tempo')) problems.push(...tempoValueProblems(metadata.tempo, 'metadata.tempo'));
  if (own(metadata, 'lengthBeats')) problems.push(...loopLengthValueProblems(metadata.lengthBeats, 'metadata.lengthBeats'));
  (Array.isArray(state.presets) ? state.presets : []).forEach((preset: unknown, i) => {
    if (isRecord(preset)) problems.push(...instrumentValueProblems(preset.params, `presets[${i}].params`));
  });
  (Array.isArray(state.tracks) ? state.tracks : []).forEach((track: unknown, i) => {
    if (!isRecord(track)) return;
    const id = typeof track.id === 'string' ? track.id : undefined;
    problems.push(...instrumentValueProblems(track.paramOverrides, `tracks[${i}].paramOverrides`, id));
    (Array.isArray(track.notes) ? track.notes : []).forEach((note: unknown, j) => {
      if (!isRecord(note)) return;
      const base = `tracks[${i}].notes[${j}]`;
      checkNumber(problems, note, 'pitch', base, (n) => n >= 0 && n <= 127, 'a MIDI pitch from 0 to 127', id);
      checkNumber(problems, note, 'startTime', base, (n) => n >= 0, 'a beat at 0 or after', id);
      checkNumber(problems, note, 'duration', base, (n) => n > 0, 'a length above 0 beats', id);
      checkNumber(problems, note, 'velocity', base, (n) => n >= 0 && n <= 127, 'a velocity from 0 to 127', id);
    });
  });
  // The rules between an instrument's fields, on each preset and on what each track plays
  const ids = (Array.isArray(state.tracks) ? state.tracks : []).map((t: unknown) => (isRecord(t) && typeof t.id === 'string' ? t.id : undefined));
  for (const p of soundscapeInstrumentProblems(state)) {
    const at = /^tracks\[(\d+)\]/.exec(p.path);
    problems.push({ ...p, track: at ? ids[Number(at[1])] : undefined });
  }
  if (own(state, 'mixer')) problems.push(...mixerValueProblems(state.mixer));
  return problems;
}
