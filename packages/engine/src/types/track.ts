import type { InstrumentParams } from './instrument';
import type { Pattern, ArrangementClip } from './pattern';
import { createPattern, createClip } from './pattern';

/** A single instrument track in a Soundscape project. */
export interface Track {
  id: string;
  name: string;
  /** References an {@link InstrumentPreset} id. */
  presetId: string;
  /** Library of all patterns available on this track. */
  patterns: Pattern[];
  /** Ordered list of pattern placements in the arrangement timeline. */
  arrangement: ArrangementClip[];
  /** Per-track synthesis parameter overrides, merged on top of the preset at playback time. */
  paramOverrides?: Partial<InstrumentParams>;
}

/**
 * Creates a new Track with a single empty Pattern ("Pattern 1") placed at beat 0.
 */
export function createTrack(name: string, presetId: string, patternLengthBeats = 16): Track {
  const defaultPattern = createPattern('Pattern 1', patternLengthBeats);
  return {
    id: crypto.randomUUID(),
    name,
    presetId,
    patterns: [defaultPattern],
    arrangement: [createClip(defaultPattern.id, 0)],
  };
}
