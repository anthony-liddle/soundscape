import { describe, it, expect } from 'vitest';
import { createPattern, createClip } from '../pattern';

describe('createPattern', () => {
  it('creates a pattern with the given name and length', () => {
    const p = createPattern('Verse', 16);
    expect(p.name).toBe('Verse');
    expect(p.lengthBeats).toBe(16);
    expect(p.notes).toEqual([]);
  });

  it('assigns a unique id', () => {
    const a = createPattern('A', 8);
    const b = createPattern('B', 8);
    expect(a.id).not.toBe(b.id);
  });
});

describe('createClip', () => {
  it('creates a clip with the given patternId and startBeat', () => {
    const clip = createClip('pattern-abc', 4);
    expect(clip.patternId).toBe('pattern-abc');
    expect(clip.startBeat).toBe(4);
  });

  it('assigns a unique id', () => {
    const a = createClip('p', 0);
    const b = createClip('p', 0);
    expect(a.id).not.toBe(b.id);
  });
});
