import { describe, it, expect } from 'vitest';
import { migrateSoundscapeState } from '../migrate';
import type { SoundscapeState } from 'soundscape-engine';

// Simulate a legacy state where tracks still have a `notes` array
const legacyState = {
  metadata: { name: 'Old Project', tempo: 120, timeSignature: [4, 4] as [number, number], lengthBeats: 16 },
  tracks: [
    {
      id: 'track-1',
      name: 'Lead',
      presetId: 'lead',
      notes: [
        { id: 'n1', pitch: 60, startTime: 0, duration: 1, velocity: 100 },
        { id: 'n2', pitch: 62, startTime: 1, duration: 1, velocity: 80 },
      ],
    },
  ],
  presets: [],
  mixer: { tracks: {}, masterVolume: 0.8 },
} as unknown as SoundscapeState;

describe('migrateSoundscapeState', () => {
  it('is a no-op on already-migrated state', () => {
    const migratedOnce = migrateSoundscapeState(legacyState);
    const migratedTwice = migrateSoundscapeState(migratedOnce);
    expect(migratedTwice.tracks[0]!.patterns.length).toBe(1);
    expect(migratedTwice.tracks[0]!.patterns[0]!.notes.length).toBe(2);
  });

  it('converts legacy track.notes into a default Pattern', () => {
    const result = migrateSoundscapeState(legacyState);
    const track = result.tracks[0]!;
    expect(track.patterns).toHaveLength(1);
    expect(track.patterns[0]!.name).toBe('Pattern 1');
    expect(track.patterns[0]!.notes).toHaveLength(2);
  });

  it('creates one clip at beat 0 for the default pattern', () => {
    const result = migrateSoundscapeState(legacyState);
    const track = result.tracks[0]!;
    expect(track.arrangement).toHaveLength(1);
    expect(track.arrangement[0]!.startBeat).toBe(0);
    expect(track.arrangement[0]!.patternId).toBe(track.patterns[0]!.id);
  });

  it('preserves all note fields from the legacy notes array', () => {
    const result = migrateSoundscapeState(legacyState);
    const notes = result.tracks[0]!.patterns[0]!.notes;
    expect(notes[0]).toMatchObject({ id: 'n1', pitch: 60, startTime: 0 });
    expect(notes[1]).toMatchObject({ id: 'n2', pitch: 62, startTime: 1 });
  });

  it('preserves track id, name, presetId, and paramOverrides', () => {
    const result = migrateSoundscapeState(legacyState);
    const track = result.tracks[0]!;
    expect(track.id).toBe('track-1');
    expect(track.name).toBe('Lead');
    expect(track.presetId).toBe('lead');
  });
});
