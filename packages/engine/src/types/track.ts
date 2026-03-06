import type { Note } from './note';
import type { InstrumentParams } from './instrument';

/** A single instrument track containing notes and optional parameter overrides. */
export interface Track {
  /** Unique identifier for this track. */
  id: string;
  /** Human-readable name displayed in the editor. */
  name: string;
  /** ID of the {@link InstrumentPreset} used as the base sound for this track. */
  presetId: string;
  /** All note events placed on this track's timeline. */
  notes: Note[];
  /**
   * Per-track overrides applied on top of the preset's {@link InstrumentParams}.
   * Only the keys you include are overridden; everything else falls through to the preset.
   */
  paramOverrides?: Partial<InstrumentParams>;
}

/**
 * Factory helper that creates a {@link Track} with a generated `id` and an empty note list.
 *
 * @param name - Human-readable label for the track.
 * @param presetId - ID of the {@link InstrumentPreset} to use as the base sound.
 * @returns A new {@link Track} object.
 *
 * @example
 * const track = createTrack('Lead Synth', 'preset-piano');
 */
export function createTrack(name: string, presetId: string): Track {
  return {
    id: crypto.randomUUID(),
    name,
    presetId,
    notes: [],
  };
}
