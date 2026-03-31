import type { InstrumentParams } from './instrument';

/** A global instrument definition. Notes live in Pattern.trackNotes, not here. */
export interface Track {
  id: string;
  name: string;
  presetId: string;
  paramOverrides?: Partial<InstrumentParams>;
}

export function createTrack(name: string, presetId: string): Track {
  return { id: crypto.randomUUID(), name, presetId };
}
