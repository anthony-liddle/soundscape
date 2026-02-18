import type { Track } from './track';
import type { InstrumentPreset } from './instrument';
import type { MixerState } from './mixer';

export interface SoundscapeMetadata {
  name: string;
  tempo: number; // BPM
  timeSignature: [number, number]; // e.g., [4, 4]
  lengthBeats: number;
}

export interface SoundscapeState {
  metadata: SoundscapeMetadata;
  tracks: Track[];
  presets: InstrumentPreset[];
  mixer: MixerState;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentBeat: number;
  loop: boolean;
}

export const defaultMetadata: SoundscapeMetadata = {
  name: 'Untitled Soundscape',
  tempo: 120,
  timeSignature: [4, 4],
  lengthBeats: 16,
};
