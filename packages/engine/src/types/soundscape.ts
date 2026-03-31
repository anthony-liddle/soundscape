import type { Track } from './track';
import type { Pattern, ArrangementClip } from './pattern';
import type { InstrumentPreset } from './instrument';
import type { MixerState } from './mixer';

export interface SoundscapeMetadata {
  name: string;
  tempo: number;
  timeSignature: [number, number];
  lengthBeats: number;
}

export interface SoundscapeState {
  metadata: SoundscapeMetadata;
  tracks: Track[];
  /** Named composition sections (Verse, Chorus, …). Each holds notes per track. */
  patterns: Pattern[];
  /** Global arrangement: ordered sequence of pattern clips on the timeline. */
  arrangement: ArrangementClip[];
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
