import { describe, it, expect } from 'vitest';
import { migrateSoundscapeState } from '../migrate';
import type { SoundscapeState } from 'soundscape-engine';

const legacyState = {
  metadata: { name: 'Test', tempo: 120, timeSignature: [4, 4] as [number, number], lengthBeats: 16 },
  tracks: [
    {
      id: 'track-1',
      name: 'Bass',
      presetId: 'bass',
      notes: [{ id: 'note-1', pitch: 48, startTime: 0, duration: 1, velocity: 100 }],
    },
  ],
  presets: [],
  mixer: { tracks: { 'track-1': { volume: 0.8, muted: false, solo: false } }, masterVolume: 0.8 },
};

describe('migrateSoundscapeState', () => {
  it('converts legacy track.notes into a single Pattern', () => {
    const result = migrateSoundscapeState(legacyState as unknown as SoundscapeState);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.name).toBe('Pattern 1');
    expect(result.patterns[0]!.trackNotes['track-1']).toHaveLength(1);
    expect(result.patterns[0]!.trackNotes['track-1']![0]!.pitch).toBe(48);
  });

  it('creates one arrangement clip at beat 0', () => {
    const result = migrateSoundscapeState(legacyState as unknown as SoundscapeState);
    expect(result.arrangement).toHaveLength(1);
    expect(result.arrangement[0]!.patternId).toBe(result.patterns[0]!.id);
    expect(result.arrangement[0]!.startBeat).toBe(0);
  });

  it('strips notes from tracks', () => {
    const result = migrateSoundscapeState(legacyState as unknown as SoundscapeState);
    const track = result.tracks[0]!;
    expect('notes' in track).toBe(false);
  });

  it('is a no-op when already migrated', () => {
    const alreadyMigrated = migrateSoundscapeState(legacyState as unknown as SoundscapeState);
    const second = migrateSoundscapeState(alreadyMigrated);
    expect(second.patterns).toHaveLength(1);
  });
});
