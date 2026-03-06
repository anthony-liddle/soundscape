import type { Track } from './track';
import type { InstrumentPreset } from './instrument';
import type { MixerState } from './mixer';

/** Project-level metadata that describes the composition. */
export interface SoundscapeMetadata {
  /** Display name of the project. */
  name: string;
  /** Playback speed in beats per minute (BPM). */
  tempo: number;
  /**
   * Time signature as a `[numerator, denominator]` tuple.
   * @example [4, 4] // common time
   * @example [3, 4] // waltz
   */
  timeSignature: [number, number];
  /** Total length of the composition in beats. */
  lengthBeats: number;
}

/**
 * Complete, serializable snapshot of a soundscape project.
 *
 * Pass this to {@link AudioEngine.updateState} to synchronize the engine
 * with your application state. The engine performs efficient diffing —
 * only changed tracks and notes are updated.
 */
export interface SoundscapeState {
  /** Project-level metadata (tempo, length, etc.). */
  metadata: SoundscapeMetadata;
  /** All instrument tracks in the project. */
  tracks: Track[];
  /**
   * All available instrument presets.
   * Includes both built-in presets and any user-created ones.
   */
  presets: InstrumentPreset[];
  /** Volume, mute, and solo state for each track and the master output. */
  mixer: MixerState;
}

/** A read-only snapshot of current playback state, useful for driving UI. */
export interface PlaybackState {
  /** Whether the engine is currently playing. */
  isPlaying: boolean;
  /** Current playhead position in beats (0-based). */
  currentBeat: number;
  /** Whether loop mode is enabled. */
  loop: boolean;
}

export const defaultMetadata: SoundscapeMetadata = {
  name: 'Untitled Soundscape',
  tempo: 120,
  timeSignature: [4, 4],
  lengthBeats: 16,
};
