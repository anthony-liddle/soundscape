import type { SoundscapeState } from '../types';

/**
 * Validate a soundscape state object
 */
export function validateSoundscapeState(state: unknown): state is SoundscapeState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Record<string, unknown>;

  // Check metadata
  if (!s.metadata || typeof s.metadata !== 'object') return false;
  const meta = s.metadata as Record<string, unknown>;
  if (typeof meta.name !== 'string') return false;
  if (typeof meta.tempo !== 'number' || meta.tempo <= 0) return false;
  if (!Array.isArray(meta.timeSignature) || meta.timeSignature.length !== 2) return false;
  if (typeof meta.lengthBeats !== 'number' || meta.lengthBeats <= 0) return false;

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
  if (typeof mixer.masterVolume !== 'number') return false;
  if (!mixer.tracks || typeof mixer.tracks !== 'object') return false;

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
  if (typeof n.pitch !== 'number' || n.pitch < 0 || n.pitch > 127) return false;
  if (typeof n.startTime !== 'number' || n.startTime < 0) return false;
  if (typeof n.duration !== 'number' || n.duration <= 0) return false;
  if (typeof n.velocity !== 'number' || n.velocity < 0 || n.velocity > 127) return false;

  return true;
}

function validatePreset(preset: unknown): boolean {
  if (!preset || typeof preset !== 'object') return false;
  const p = preset as Record<string, unknown>;

  if (typeof p.id !== 'string') return false;
  if (typeof p.name !== 'string') return false;
  if (typeof p.isBuiltIn !== 'boolean') return false;
  if (!p.params || typeof p.params !== 'object') return false;

  return true;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
