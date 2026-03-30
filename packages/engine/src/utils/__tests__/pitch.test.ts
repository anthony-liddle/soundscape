import { describe, it, expect } from 'vitest'
import {
  midiToFrequency,
  frequencyToMidi,
  midiToNoteName,
  applyPitchOffset,
  normalizedToFilterFreq,
  normalizedToQ,
  normalizedToLfoRate,
  normalizedToLfoFilterDepth,
  normalizedToLfoPitchDepth,
} from '../pitch'

describe('pitch utilities', () => {
  describe('midiToFrequency', () => {
    it('returns 440Hz for A4 (MIDI 69)', () => {
      expect(midiToFrequency(69)).toBe(440)
    })

    it('returns ~261.63Hz for C4 (MIDI 60)', () => {
      expect(midiToFrequency(60)).toBeCloseTo(261.63, 1)
    })

    it('returns ~880Hz for A5 (MIDI 81)', () => {
      expect(midiToFrequency(81)).toBeCloseTo(880, 1)
    })

    it('returns ~220Hz for A3 (MIDI 57)', () => {
      expect(midiToFrequency(57)).toBeCloseTo(220, 1)
    })
  })

  describe('frequencyToMidi', () => {
    it('returns 69 for 440Hz (A4)', () => {
      expect(frequencyToMidi(440)).toBe(69)
    })

    it('returns 60 for ~261.63Hz (C4)', () => {
      expect(frequencyToMidi(261.63)).toBe(60)
    })

    it('returns 81 for 880Hz (A5)', () => {
      expect(frequencyToMidi(880)).toBe(81)
    })

    it('rounds to nearest MIDI note', () => {
      expect(frequencyToMidi(445)).toBe(69) // Close to A4
      expect(frequencyToMidi(466)).toBe(70) // Closer to A#4
    })
  })

  describe('midiToNoteName', () => {
    it('returns correct note names', () => {
      expect(midiToNoteName(60)).toBe('C4')
      expect(midiToNoteName(69)).toBe('A4')
      expect(midiToNoteName(72)).toBe('C5')
      expect(midiToNoteName(61)).toBe('C#4')
    })

    it('handles low octaves', () => {
      expect(midiToNoteName(21)).toBe('A0')
      expect(midiToNoteName(24)).toBe('C1')
    })

    it('handles high octaves', () => {
      expect(midiToNoteName(108)).toBe('C8')
      expect(midiToNoteName(127)).toBe('G9')
    })
  })

  describe('applyPitchOffset', () => {
    it('adds positive semitones', () => {
      expect(applyPitchOffset(60, 12)).toBe(72)
    })

    it('subtracts negative semitones', () => {
      expect(applyPitchOffset(72, -12)).toBe(60)
    })

    it('handles zero offset', () => {
      expect(applyPitchOffset(60, 0)).toBe(60)
    })
  })

  describe('normalizedToFilterFreq', () => {
    it('returns 20Hz at 0', () => {
      expect(normalizedToFilterFreq(0)).toBe(20)
    })

    it('returns 20000Hz at 1', () => {
      expect(normalizedToFilterFreq(1)).toBe(20000)
    })

    it('returns intermediate values exponentially', () => {
      const midValue = normalizedToFilterFreq(0.5)
      expect(midValue).toBeGreaterThan(20)
      expect(midValue).toBeLessThan(20000)
    })
  })

  describe('normalizedToQ', () => {
    it('returns 0.5 at 0', () => {
      expect(normalizedToQ(0)).toBe(0.5)
    })

    it('returns 20 at 1', () => {
      expect(normalizedToQ(1)).toBe(20)
    })

    it('returns linear intermediate values', () => {
      expect(normalizedToQ(0.5)).toBeCloseTo(10.25, 2)
    })
  })

  describe('normalizedToLfoRate', () => {
    it('returns 0.1 Hz at 0 (slowest sweep)', () => {
      expect(normalizedToLfoRate(0)).toBeCloseTo(0.1, 5)
    })

    it('returns 20 Hz at 1 (fastest wobble)', () => {
      expect(normalizedToLfoRate(1)).toBeCloseTo(20, 5)
    })

    it('uses exponential mapping — midpoint is geometric mean', () => {
      const mid = normalizedToLfoRate(0.5)
      // Geometric mean of 0.1 and 20
      expect(mid).toBeCloseTo(Math.sqrt(0.1 * 20), 4)
    })

    it('returns values in (0.1, 20) for intermediate inputs', () => {
      const val = normalizedToLfoRate(0.3)
      expect(val).toBeGreaterThan(0.1)
      expect(val).toBeLessThan(20)
    })
  })

  describe('normalizedToLfoFilterDepth', () => {
    it('returns 0 Hz at 0 (no modulation)', () => {
      expect(normalizedToLfoFilterDepth(0)).toBe(0)
    })

    it('returns 4000 Hz at 1 (maximum sweep)', () => {
      expect(normalizedToLfoFilterDepth(1)).toBe(4000)
    })

    it('scales linearly', () => {
      expect(normalizedToLfoFilterDepth(0.5)).toBe(2000)
      expect(normalizedToLfoFilterDepth(0.25)).toBe(1000)
    })
  })

  describe('normalizedToLfoPitchDepth', () => {
    it('returns 0 cents at 0 (no vibrato)', () => {
      expect(normalizedToLfoPitchDepth(0)).toBe(0)
    })

    it('returns 100 cents at 1 (one semitone vibrato)', () => {
      expect(normalizedToLfoPitchDepth(1)).toBe(100)
    })

    it('scales linearly', () => {
      expect(normalizedToLfoPitchDepth(0.5)).toBe(50)
      expect(normalizedToLfoPitchDepth(0.1)).toBeCloseTo(10, 5)
    })
  })
})
