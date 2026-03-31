import { describe, it, expect } from 'vitest';
import { soundscapeReducer, createInitialState } from '../../../state/reducer';

describe('velocity lane — reducer behavior', () => {
  it('updates note velocity via UPDATE_NOTE', () => {
    const state = createInitialState();
    const track = state.tracks[0]!;
    const patternId = state.patterns[0]!.id;

    const withNote = soundscapeReducer(state, {
      type: 'ADD_NOTE',
      payload: { patternId, trackId: track.id, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    });
    const note = withNote.patterns[0]!.trackNotes[track.id]![0]!;

    const updated = soundscapeReducer(withNote, {
      type: 'UPDATE_NOTE',
      payload: { patternId, trackId: track.id, noteId: note.id, updates: { velocity: 64 } },
    });

    expect(updated.patterns[0]!.trackNotes[track.id]![0]!.velocity).toBe(64);
  });

  it('velocity clamp formula: max(1, min(127, raw))', () => {
    const clamp = (raw: number) => Math.round(Math.max(1, Math.min(127, raw)));
    expect(clamp(-5)).toBe(1);
    expect(clamp(0)).toBe(1);
    expect(clamp(64)).toBe(64);
    expect(clamp(127)).toBe(127);
    expect(clamp(200)).toBe(127);
  });
});
