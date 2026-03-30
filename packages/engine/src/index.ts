// Types
export type {
  Note,
  Waveform,
  FilterType,
  LfoTarget,
  InstrumentParams,
  InstrumentPreset,
  Track,
  TrackMixerState,
  MixerState,
  SoundscapeMetadata,
  SoundscapeState,
  PlaybackState,
} from './types';

export {
  createNote,
  defaultInstrumentParams,
  createTrack,
  defaultTrackMixerState,
  createMixerState,
  defaultMetadata,
} from './types';

// Audio
export { AudioEngine } from './audio';
export { VoiceSynthesizer } from './audio';
export type { VoiceParams } from './audio/VoiceSynthesizer';
export { EffectsChain } from './audio';
export type { EffectsParams } from './audio/EffectsChain';

// Presets
export { builtInPresets, getPresetById } from './presets';
export {
  bassPreset,
  leadPreset,
  padPreset,
  keysPreset,
  pluckPreset,
  percussionPreset,
} from './presets';

// Utils
export {
  midiToFrequency,
  frequencyToMidi,
  midiToNoteName,
  applyPitchOffset,
  normalizedToFilterFreq,
  normalizedToQ,
  normalizedToLfoRate,
  normalizedToLfoFilterDepth,
  normalizedToLfoPitchDepth,
} from './utils/pitch';

export {
  beatsToSeconds,
  secondsToBeats,
  normalizedToADSR,
  normalizedToDelayTime,
  formatTime,
  formatBeats,
} from './utils/time';

export {
  validateSoundscapeState,
  clamp,
} from './utils/validation';
