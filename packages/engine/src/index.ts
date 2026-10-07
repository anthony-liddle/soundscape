// Types
export type {
  Note,
  Waveform,
  FilterType,
  EnvelopeCurve,
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
export type { AudioEngineOptions } from './audio/AudioEngine';
export { VoiceSynthesizer } from './audio';
export type { VoiceParams } from './audio/VoiceSynthesizer';
export { EffectsChain } from './audio';
export type { EffectsChainOptions, EffectsParams } from './audio/EffectsChain';

// Cues
export {
  CUE_FORMAT,
  CUE_VERSION,
  CueDocumentError,
  parseCueDocument,
  validateCueDocument,
  serializeCueDocument,
} from './cues';
export type { Cue, CueDocument, CueInstrument, CueNote, CueProblem, CueValidation } from './cues';

// Presets
export { builtInPresets, getPresetById } from './presets';
export {
  bassPreset,
  leadPreset,
  padPreset,
  keysPreset,
  pluckPreset,
  percussionPreset,
  pianoPreset,
  organPreset,
  stringsPreset,
  bellPreset,
  marimbaPreset,
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
  soundscapeInstrumentProblems,
  clamp,
} from './utils/validation';
export type { InstrumentProblem } from './utils/validation';
