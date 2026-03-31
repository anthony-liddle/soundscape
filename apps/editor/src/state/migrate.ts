import { createPattern, createClip } from 'soundscape-engine';
import type { SoundscapeState, Note } from 'soundscape-engine';

interface LegacyTrack {
  id: string;
  name: string;
  presetId: string;
  notes?: Note[];
  paramOverrides?: object;
}

export function migrateSoundscapeState(state: SoundscapeState): SoundscapeState {
  // Already migrated — has patterns array
  if (
    'patterns' in state &&
    Array.isArray((state as SoundscapeState).patterns) &&
    (state as SoundscapeState).patterns.length > 0
  ) {
    return state;
  }

  const legacyTracks = state.tracks as unknown as LegacyTrack[];

  // Build "Pattern 1" from all tracks' legacy notes
  const pattern = createPattern('Pattern 1', state.metadata.lengthBeats);
  for (const t of legacyTracks) {
    if (Array.isArray(t.notes) && t.notes.length > 0) {
      pattern.trackNotes[t.id] = t.notes;
    }
  }
  const clip = createClip(pattern.id, 0);

  // Strip notes field from each track
  const cleanTracks = legacyTracks.map(({ notes: _notes, ...rest }) => rest) as SoundscapeState['tracks'];

  return { ...state, tracks: cleanTracks, patterns: [pattern], arrangement: [clip] };
}
