import type { SoundscapeState } from '../types';

const WAVEFORMS = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const FILTER_TYPES = new Set(['lowpass', 'highpass', 'bandpass', 'notch']);
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
const OPTIONAL_NUMERIC_PARAMS = ['reverbMix', 'lfoRate', 'lfoDepth', 'unisonDetune'] as const;

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
