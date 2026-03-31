import type { SoundscapeState, Track } from 'soundscape-engine';
import { createPattern, createClip } from 'soundscape-engine';

/**
 * Legacy track shape — `notes` array present instead of `patterns` + `arrangement`.
 * Used only for type narrowing during migration.
 */
interface LegacyTrack {
  id: string;
  name: string;
  presetId: string;
  notes: Track['patterns'][number]['notes'];
  paramOverrides?: Track['paramOverrides'];
}

function isLegacyTrack(track: Track | LegacyTrack): track is LegacyTrack {
  return 'notes' in track && !('patterns' in track);
}

function migrateTrack(track: Track | LegacyTrack): Track {
  if (!isLegacyTrack(track)) return track;

  const pattern = createPattern('Pattern 1', 16);
  pattern.notes = track.notes.map((n) => ({ ...n }));
  const clip = createClip(pattern.id, 0);

  const migrated: Track = {
    id: track.id,
    name: track.name,
    presetId: track.presetId,
    patterns: [pattern],
    arrangement: [clip],
  };
  if (track.paramOverrides) {
    migrated.paramOverrides = { ...track.paramOverrides };
  }
  return migrated;
}

/**
 * Converts any legacy `SoundscapeState` (tracks with `notes` arrays) to the
 * current format (tracks with `patterns` + `arrangement`). Safe to call on
 * already-migrated state — it is a no-op when no legacy tracks are present.
 */
export function migrateSoundscapeState(state: SoundscapeState): SoundscapeState {
  const hasMigratableTrack = (state.tracks as unknown[]).some(
    (t) => 'notes' in (t as object) && !('patterns' in (t as object))
  );
  if (!hasMigratableTrack) return state;

  return {
    ...state,
    tracks: state.tracks.map((t) => migrateTrack(t as Track | LegacyTrack)),
  };
}
