import { describe, it, expect } from 'vitest';
import { AudioEngine } from '../AudioEngine';

describe('AudioEngine MIDI API', () => {
  it('exposes startMIDINote method', () => {
    const engine = new AudioEngine();
    expect(typeof engine.startMIDINote).toBe('function');
  });

  it('exposes stopMIDINote method', () => {
    const engine = new AudioEngine();
    expect(typeof engine.stopMIDINote).toBe('function');
  });

  it('stopMIDINote does not throw when pitch has no active note', () => {
    const engine = new AudioEngine();
    expect(() => engine.stopMIDINote(60)).not.toThrow();
  });
});
