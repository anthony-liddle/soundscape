import { describe, it, expect } from 'vitest';
import { createPattern, createClip } from '../pattern';

describe('createPattern', () => {
  it('creates a pattern with empty trackNotes', () => {
    const p = createPattern('Verse', 16);
    expect(p.name).toBe('Verse');
    expect(p.lengthBeats).toBe(16);
    expect(p.trackNotes).toEqual({});
  });

  it('assigns unique ids', () => {
    const a = createPattern('A', 8);
    const b = createPattern('B', 8);
    expect(a.id).not.toBe(b.id);
  });
});

describe('createClip', () => {
  it('creates a clip with patternId and startBeat', () => {
    const c = createClip('pattern-abc', 4);
    expect(c.patternId).toBe('pattern-abc');
    expect(c.startBeat).toBe(4);
  });

  it('assigns unique ids', () => {
    const a = createClip('p', 0);
    const b = createClip('p', 0);
    expect(a.id).not.toBe(b.id);
  });
});
