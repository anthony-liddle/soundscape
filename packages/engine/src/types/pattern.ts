import type { Note } from './note';

/** A named composition section (e.g. "Verse", "Chorus"). Contains notes for any subset of global tracks. */
export interface Pattern {
  id: string;
  name: string;
  /** Duration of this section in beats. */
  lengthBeats: number;
  /** Notes keyed by trackId. Only tracks with notes need an entry. */
  trackNotes: Record<string, Note[]>;
}

/** Places a Pattern at a specific beat position on the global arrangement timeline. */
export interface ArrangementClip {
  id: string;
  patternId: string;
  startBeat: number;
}

export function createPattern(name: string, lengthBeats: number): Pattern {
  return { id: crypto.randomUUID(), name, lengthBeats, trackNotes: {} };
}

export function createClip(patternId: string, startBeat: number): ArrangementClip {
  return { id: crypto.randomUUID(), patternId, startBeat };
}
