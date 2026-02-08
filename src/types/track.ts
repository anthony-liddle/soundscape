import type { Note } from './note';
import type { InstrumentParams } from './instrument';

export interface Track {
  id: string;
  name: string;
  presetId: string;
  notes: Note[];
  paramOverrides?: Partial<InstrumentParams>;
}

export function createTrack(name: string, presetId: string): Track {
  return {
    id: crypto.randomUUID(),
    name,
    presetId,
    notes: [],
  };
}
