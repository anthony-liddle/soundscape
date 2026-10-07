import type { SoundscapeState } from '../types';

const WAVEFORMS = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass', 'notch', 'none']);
const ENVELOPE_CURVES = new Set(['linear', 'exponential']);
const LFO_TARGETS = new Set(['filter', 'pitch']);

/** Finite number check — rejects NaN and ±Infinity, which `typeof` lets through. */
function isFinite_(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate a soundscape state object.
 *
 * Strict since 0.3.0: all numeric fields must be finite (NaN and Infinity are
 * rejected), preset params are fully validated including enum fields, and
 * mixer track entries are checked. Use this at every boundary where untrusted
 * JSON enters the engine.
 */
export function validateSoundscapeState(state: unknown): state is SoundscapeState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Record<string, unknown>;

  // Check metadata
  if (!s.metadata || typeof s.metadata !== 'object') return false;
  const meta = s.metadata as Record<string, unknown>;
  if (typeof meta.name !== 'string') return false;
  if (!isFinite_(meta.tempo) || meta.tempo <= 0) return false;
  if (!Array.isArray(meta.timeSignature) || meta.timeSignature.length !== 2) return false;
  if (!meta.timeSignature.every((n) => isFinite_(n) && n > 0)) return false;
  if (!isFinite_(meta.lengthBeats) || meta.lengthBeats <= 0) return false;

  // Check tracks
  if (!Array.isArray(s.tracks)) return false;
  for (const track of s.tracks) {
    if (!validateTrack(track)) return false;
  }

  // Check presets
  if (!Array.isArray(s.presets)) return false;
  for (const preset of s.presets) {
    if (!validatePreset(preset)) return false;
  }

  // The 0.4.0 instrument rules, on every preset and on the instrument each
  // track plays, and the fields only a cue instrument can have: anything that
  // would throw when played is refused here, at load, with a path to it
  if (soundscapeInstrumentProblems(s).length > 0) return false;

  // Check mixer
  if (!s.mixer || typeof s.mixer !== 'object') return false;
  const mixer = s.mixer as Record<string, unknown>;
  if (!isFinite_(mixer.masterVolume)) return false;
  if (!mixer.tracks || typeof mixer.tracks !== 'object') return false;
  for (const entry of Object.values(mixer.tracks as Record<string, unknown>)) {
    if (!validateTrackMixer(entry)) return false;
  }

  return true;
}

function validateTrack(track: unknown): boolean {
  if (!track || typeof track !== 'object') return false;
  const t = track as Record<string, unknown>;

  if (typeof t.id !== 'string') return false;
  if (typeof t.name !== 'string') return false;
  if (typeof t.presetId !== 'string') return false;
  if (!Array.isArray(t.notes)) return false;

  for (const note of t.notes) {
    if (!validateNote(note)) return false;
  }

  return true;
}

function validateNote(note: unknown): boolean {
  if (!note || typeof note !== 'object') return false;
  const n = note as Record<string, unknown>;

  if (typeof n.id !== 'string') return false;
  if (!isFinite_(n.pitch) || n.pitch < 0 || n.pitch > 127) return false;
  if (!isFinite_(n.startTime) || n.startTime < 0) return false;
  if (!isFinite_(n.duration) || n.duration <= 0) return false;
  if (!isFinite_(n.velocity) || n.velocity < 0 || n.velocity > 127) return false;

  return true;
}

// Required numeric params on every instrument
const REQUIRED_NUMERIC_PARAMS = [
  'pitchOffset',
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
  'velocityResponse',
] as const;

// Optional numeric params — validated only when present
const OPTIONAL_NUMERIC_PARAMS = ['reverbMix', 'lfoRate', 'lfoDepth', 'unisonDetune', 'envelopeFloor'] as const;

function validatePreset(preset: unknown): boolean {
  if (!preset || typeof preset !== 'object') return false;
  const p = preset as Record<string, unknown>;

  if (typeof p.id !== 'string') return false;
  if (typeof p.name !== 'string') return false;
  if (typeof p.isBuiltIn !== 'boolean') return false;
  if (!p.params || typeof p.params !== 'object') return false;

  const params = p.params as Record<string, unknown>;
  if (typeof params.waveform !== 'string' || !WAVEFORMS.has(params.waveform)) return false;
  for (const key of REQUIRED_NUMERIC_PARAMS) {
    if (!isFinite_(params[key])) return false;
  }
  for (const key of OPTIONAL_NUMERIC_PARAMS) {
    if (params[key] !== undefined && !isFinite_(params[key])) return false;
  }
  if (params.filterType !== undefined) {
    if (typeof params.filterType !== 'string' || !FILTER_TYPES.has(params.filterType)) return false;
  }
  if (params.lfoTarget !== undefined) {
    if (typeof params.lfoTarget !== 'string' || !LFO_TARGETS.has(params.lfoTarget)) return false;
  }

  return true;
}

/** One value an instrument in a soundscape state cannot have, and the path to it. */
export interface InstrumentProblem {
  /** Where, for example `presets[0].params.envelopeFloor`. */
  path: string;
  message: string;
}

/** Instrument fields only a cue instrument can have, and why a preset cannot. */
const CUE_ONLY_PARAMS: Record<string, string> = {
  decayUntilRelease:
    'is only for cue instruments: the transport starts a note without knowing when it will be released',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The fields only a cue can have, wherever `values` has one. */
function cueOnlyProblems(values: Record<string, unknown>): { key: string; message: string }[] {
  return Object.entries(CUE_ONLY_PARAMS)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(values, key))
    .map(([key, message]) => ({ key, message }));
}

/**
 * Every value that would stop an instrument in a soundscape state from
 * playing, with the path to it: the 0.4.0 envelope and filter rules and the
 * fields only a cue can have, on each preset's params and on the instrument
 * each track plays, its preset with its overrides on top. A track's problem
 * that its preset already has is reported once, at the preset.
 *
 * {@link validateSoundscapeState} refuses a state with any of these. This
 * says where they are. It checks the instruments alone, not the rest of the
 * state.
 */
export function soundscapeInstrumentProblems(state: unknown): InstrumentProblem[] {
  const problems: InstrumentProblem[] = [];
  if (!isRecord(state)) return problems;

  const presets = new Map<unknown, Record<string, unknown>>();
  (Array.isArray(state.presets) ? state.presets : []).forEach((preset: unknown, i) => {
    if (!isRecord(preset) || !isRecord(preset.params)) return;
    if (!presets.has(preset.id)) presets.set(preset.id, preset.params);
    for (const p of [...cueOnlyProblems(preset.params), ...envelopeAndFilterProblems(preset.params)]) {
      problems.push({ path: `presets[${i}].params.${p.key}`, message: p.message });
    }
  });

  (Array.isArray(state.tracks) ? state.tracks : []).forEach((track: unknown, i) => {
    if (!isRecord(track) || !isRecord(track.paramOverrides)) return;
    const overrides = track.paramOverrides;
    const base = `tracks[${i}].paramOverrides`;
    for (const p of cueOnlyProblems(overrides)) problems.push({ path: `${base}.${p.key}`, message: p.message });
    const preset = presets.get(track.presetId);
    if (!preset) return;
    const its = new Set(envelopeAndFilterProblems(preset).map((p) => `${p.key} ${p.message}`));
    for (const p of envelopeAndFilterProblems({ ...preset, ...overrides })) {
      if (its.has(`${p.key} ${p.message}`)) continue;
      // An override can break a rule through a key it does not set, as taking
      // the filter away breaks an LFO aimed at it: then the overrides are named
      problems.push(
        Object.prototype.hasOwnProperty.call(overrides, p.key)
          ? { path: `${base}.${p.key}`, message: p.message }
          : { path: base, message: `with these overrides, ${p.key}: ${p.message}` }
      );
    }
  });

  return problems;
}

/**
 * Rules for the 0.4.0 fields, shared with the cue validator. Each problem names
 * the key it is about. A file that validated before 0.4.0 cannot hold any of
 * these values, so none of them can reject an older file.
 */
export function envelopeAndFilterProblems(
  params: Record<string, unknown>
): { key: string; message: string }[] {
  const problems: { key: string; message: string }[] = [];
  const curve = params.envelopeCurve;
  if (curve !== undefined && (typeof curve !== 'string' || !ENVELOPE_CURVES.has(curve))) {
    problems.push({ key: 'envelopeCurve', message: "must be 'linear' or 'exponential'" });
  }
  const floor = params.envelopeFloor;
  if (curve === 'exponential') {
    if (!isFinite_(floor) || floor <= 0 || floor >= 1) {
      problems.push({
        key: 'envelopeFloor',
        message: 'an exponential envelope needs a floor between 0 and 1, exclusive',
      });
    }
  } else if (floor !== undefined) {
    problems.push({ key: 'envelopeFloor', message: 'applies only to an exponential envelope' });
  }
  const lfoOnFilter = (params.lfoTarget ?? 'filter') === 'filter';
  if (params.filterType === 'none' && isFinite_(params.lfoDepth) && params.lfoDepth > 0 && lfoOnFilter) {
    problems.push({ key: 'lfoTarget', message: "an LFO aimed at the filter does nothing when filterType is 'none'" });
  }
  return problems;
}

function validateTrackMixer(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const m = entry as Record<string, unknown>;
  if (!isFinite_(m.volume)) return false;
  if (typeof m.mute !== 'boolean') return false;
  if (typeof m.solo !== 'boolean') return false;
  return true;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
