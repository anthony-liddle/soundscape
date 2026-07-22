import type {
  SoundscapeState,
  SoundscapeMetadata,
  Track,
  Note,
  InstrumentPreset,
  MixerState,
  TrackMixerState,
} from 'soundscape-engine';
import {
  builtInPresets,
  defaultMetadata,
  defaultTrackMixerState,
  validateSoundscapeState,
  clamp,
} from 'soundscape-engine';

export interface RepairResult {
  state: SoundscapeState;
  /** Human-readable descriptions of every fix applied. Empty if none needed. */
  repairs: string[];
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Attempt to repair a parsed soundscape file that fails strict validation.
 *
 * Invalid values are replaced with defaults, invalid notes and presets are
 * dropped, and every fix is reported so the user can decide whether to load
 * the repaired project. Returns null when the input is not recognizably a
 * soundscape (no salvageable tracks array).
 */
export function repairSoundscapeState(input: unknown): RepairResult | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.tracks)) return null;

  const repairs: string[] = [];

  // --- metadata ---
  const rawMeta = (raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}) as Record<
    string,
    unknown
  >;
  const metadata: SoundscapeMetadata = { ...defaultMetadata };
  if (typeof rawMeta.name === 'string') {
    metadata.name = rawMeta.name;
  } else {
    repairs.push(`Project name reset to "${defaultMetadata.name}"`);
  }
  if (isFiniteNum(rawMeta.tempo) && rawMeta.tempo > 0) {
    metadata.tempo = rawMeta.tempo;
  } else {
    repairs.push(`Invalid tempo reset to ${defaultMetadata.tempo} BPM`);
  }
  const ts = rawMeta.timeSignature;
  if (Array.isArray(ts) && ts.length === 2 && ts.every((n) => isFiniteNum(n) && n > 0)) {
    metadata.timeSignature = [ts[0], ts[1]] as [number, number];
  } else if (ts !== undefined) {
    repairs.push('Invalid time signature reset to 4/4');
  }
  if (isFiniteNum(rawMeta.lengthBeats) && rawMeta.lengthBeats > 0) {
    metadata.lengthBeats = rawMeta.lengthBeats;
  } else {
    repairs.push(`Invalid length reset to ${defaultMetadata.lengthBeats} beats`);
  }

  // --- presets: keep valid ones from the file, always ensure built-ins work ---
  const presets: InstrumentPreset[] = [];
  let droppedPresets = 0;
  if (Array.isArray(raw.presets)) {
    for (const preset of raw.presets) {
      if (isValidPreset(preset)) {
        presets.push(preset as InstrumentPreset);
      } else {
        droppedPresets++;
      }
    }
  }
  if (droppedPresets > 0) {
    repairs.push(`Dropped ${droppedPresets} invalid preset${droppedPresets === 1 ? '' : 's'}`);
  }
  // Merge in built-ins the file doesn't override
  const presentIds = new Set(presets.map((p) => p.id));
  for (const builtin of builtInPresets) {
    if (!presentIds.has(builtin.id)) presets.push(builtin);
  }
  const presetIds = new Set(presets.map((p) => p.id));
  const fallbackPresetId = presets[0]!.id;

  // --- tracks and notes ---
  const tracks: Track[] = [];
  let droppedTracks = 0;
  let droppedNotes = 0;
  let reassignedTracks = 0;
  for (const [index, rawTrack] of (raw.tracks as unknown[]).entries()) {
    if (!rawTrack || typeof rawTrack !== 'object') {
      droppedTracks++;
      continue;
    }
    const t = rawTrack as Record<string, unknown>;
    const id = typeof t.id === 'string' ? t.id : crypto.randomUUID();
    const name = typeof t.name === 'string' ? t.name : `Track ${index + 1}`;
    let presetId = typeof t.presetId === 'string' ? t.presetId : fallbackPresetId;
    if (!presetIds.has(presetId)) {
      presetId = fallbackPresetId;
      reassignedTracks++;
    }

    const notes: Note[] = [];
    if (Array.isArray(t.notes)) {
      for (const rawNote of t.notes) {
        if (isValidNote(rawNote)) {
          notes.push(rawNote as Note);
        } else {
          droppedNotes++;
        }
      }
    }
    const track: Track = { id, name, presetId, notes };
    if (t.paramOverrides && typeof t.paramOverrides === 'object') {
      // Keep only finite/known-shaped overrides; invalid entries are dropped
      const cleaned = cleanOverrides(t.paramOverrides as Record<string, unknown>);
      if (Object.keys(cleaned.overrides).length > 0) track.paramOverrides = cleaned.overrides;
      if (cleaned.dropped > 0) {
        repairs.push(`Dropped ${cleaned.dropped} invalid parameter override${cleaned.dropped === 1 ? '' : 's'} on "${name}"`);
      }
    }
    tracks.push(track);
  }
  if (droppedTracks > 0) repairs.push(`Dropped ${droppedTracks} unreadable track${droppedTracks === 1 ? '' : 's'}`);
  if (droppedNotes > 0) repairs.push(`Dropped ${droppedNotes} invalid note${droppedNotes === 1 ? '' : 's'}`);
  if (reassignedTracks > 0) {
    repairs.push(`Reassigned ${reassignedTracks} track${reassignedTracks === 1 ? '' : 's'} with a missing preset`);
  }

  // --- mixer ---
  const rawMixer = (raw.mixer && typeof raw.mixer === 'object' ? raw.mixer : {}) as Record<
    string,
    unknown
  >;
  let masterVolume = 0.8;
  if (isFiniteNum(rawMixer.masterVolume)) {
    const clamped = clamp(rawMixer.masterVolume, 0, 1);
    if (clamped !== rawMixer.masterVolume) repairs.push('Master volume clamped to 0–1');
    masterVolume = clamped;
  } else if (rawMixer.masterVolume !== undefined) {
    repairs.push('Invalid master volume reset to 80%');
  }
  const mixerTracks: Record<string, TrackMixerState> = {};
  const rawEntries = (rawMixer.tracks && typeof rawMixer.tracks === 'object' ? rawMixer.tracks : {}) as Record<string, unknown>;
  let repairedMixerEntries = 0;
  for (const track of tracks) {
    const entry = rawEntries[track.id];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const volumeOk = isFiniteNum(e.volume);
      const flagsOk = typeof e.mute === 'boolean' && typeof e.solo === 'boolean';
      if (volumeOk && flagsOk) {
        const clamped = clamp(e.volume as number, 0, 1);
        if (clamped !== e.volume) repairedMixerEntries++;
        mixerTracks[track.id] = { volume: clamped, mute: e.mute as boolean, solo: e.solo as boolean };
        continue;
      }
    }
    repairedMixerEntries++;
    mixerTracks[track.id] = { ...defaultTrackMixerState };
  }
  if (repairedMixerEntries > 0) {
    repairs.push(`Repaired ${repairedMixerEntries} mixer channel${repairedMixerEntries === 1 ? '' : 's'}`);
  }
  const mixer: MixerState = { tracks: mixerTracks, masterVolume };

  const state: SoundscapeState = { metadata, tracks, presets, mixer };
  if (!validateSoundscapeState(state)) return null;
  return { state, repairs };
}

// Reuse the engine's strict validator by probing single-item states is
// wasteful; instead mirror the per-item rules locally via small checks.
function isValidNote(note: unknown): boolean {
  if (!note || typeof note !== 'object') return false;
  const n = note as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    isFiniteNum(n.pitch) && n.pitch >= 0 && n.pitch <= 127 &&
    isFiniteNum(n.startTime) && n.startTime >= 0 &&
    isFiniteNum(n.duration) && n.duration > 0 &&
    isFiniteNum(n.velocity) && n.velocity >= 0 && n.velocity <= 127
  );
}

function isValidPreset(preset: unknown): boolean {
  // Validate by wrapping in a minimal state and reusing the engine validator,
  // so preset rules can never drift from the engine's
  return validateSoundscapeState({
    metadata: { name: '', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
    tracks: [],
    presets: [preset],
    mixer: { tracks: {}, masterVolume: 0.8 },
  });
}

const NUMERIC_OVERRIDE_KEYS = new Set([
  'pitchOffset', 'attack', 'decay', 'sustain', 'release', 'filterCutoff',
  'filterResonance', 'delayTime', 'delayFeedback', 'delayMix', 'distortion',
  'reverbMix', 'lfoRate', 'lfoDepth', 'unisonDetune', 'velocityResponse',
]);
const ENUM_OVERRIDE_VALUES: Record<string, Set<string>> = {
  waveform: new Set(['sine', 'square', 'sawtooth', 'triangle']),
  filterType: new Set(['lowpass', 'highpass', 'bandpass', 'notch']),
  lfoTarget: new Set(['filter', 'pitch']),
};

function cleanOverrides(raw: Record<string, unknown>): {
  overrides: Record<string, number | string>;
  dropped: number;
} {
  const overrides: Record<string, number | string> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (NUMERIC_OVERRIDE_KEYS.has(key) && isFiniteNum(value)) {
      overrides[key] = value;
    } else if (key in ENUM_OVERRIDE_VALUES && typeof value === 'string' && ENUM_OVERRIDE_VALUES[key]!.has(value)) {
      overrides[key] = value;
    } else {
      dropped++;
    }
  }
  return { overrides, dropped };
}
