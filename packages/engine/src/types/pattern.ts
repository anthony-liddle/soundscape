import type { Note } from './note';

/** A named, reusable block of notes with its own length. */
export interface Pattern {
  id: string;
  name: string;
  notes: Note[];
  /** Length of this pattern in beats (e.g. 4, 8, 16). */
  lengthBeats: number;
}

/** A Pattern placed at a specific beat position on a track's arrangement timeline. */
export interface ArrangementClip {
  id: string;
  patternId: string;
  /** Beat offset from the start of the arrangement where this clip begins. */
  startBeat: number;
}

/** Creates a new empty Pattern with a generated id. */
export function createPattern(name: string, lengthBeats: number): Pattern {
  return { id: crypto.randomUUID(), name, notes: [], lengthBeats };
}

/** Creates a new ArrangementClip with a generated id. */
export function createClip(patternId: string, startBeat: number): ArrangementClip {
  return { id: crypto.randomUUID(), patternId, startBeat };
}
