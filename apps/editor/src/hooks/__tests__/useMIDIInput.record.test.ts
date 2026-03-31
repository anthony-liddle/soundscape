import { describe, it, expect } from 'vitest';

describe('MIDI recording — duration calculation', () => {
  const calcDuration = (startBeat: number, endBeat: number, subdivision: number) =>
    Math.max(endBeat - startBeat, subdivision);

  it('uses actual duration when longer than one subdivision', () => {
    expect(calcDuration(2.5, 3.25, 0.25)).toBe(0.75);
  });

  it('clamps duration to at least one subdivision', () => {
    expect(calcDuration(2.0, 2.0, 0.25)).toBe(0.25);
  });

  it('handles multi-bar notes', () => {
    expect(calcDuration(0, 8, 0.25)).toBe(8);
  });
});
