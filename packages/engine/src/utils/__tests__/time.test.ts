import { describe, it, expect } from 'vitest'
import {
  beatsToSeconds,
  secondsToBeats,
  normalizedToADSR,
  normalizedToDelayTime,
  formatTime,
  formatBeats,
} from '../time'

describe('time utilities', () => {
  describe('beatsToSeconds', () => {
    it('converts beats to seconds at 120 BPM', () => {
      expect(beatsToSeconds(1, 120)).toBe(0.5)
      expect(beatsToSeconds(4, 120)).toBe(2)
    })

    it('converts beats to seconds at 60 BPM', () => {
      expect(beatsToSeconds(1, 60)).toBe(1)
      expect(beatsToSeconds(4, 60)).toBe(4)
    })

    it('handles fractional beats', () => {
      expect(beatsToSeconds(0.5, 120)).toBe(0.25)
    })
  })

  describe('secondsToBeats', () => {
    it('converts seconds to beats at 120 BPM', () => {
      expect(secondsToBeats(0.5, 120)).toBe(1)
      expect(secondsToBeats(2, 120)).toBe(4)
    })

    it('converts seconds to beats at 60 BPM', () => {
      expect(secondsToBeats(1, 60)).toBe(1)
      expect(secondsToBeats(4, 60)).toBe(4)
    })

    it('is the inverse of beatsToSeconds', () => {
      const bpm = 120
      const beats = 3.5
      expect(secondsToBeats(beatsToSeconds(beats, bpm), bpm)).toBeCloseTo(beats)
    })
  })

  describe('normalizedToADSR', () => {
    describe('attack', () => {
      it('returns minimum at 0', () => {
        expect(normalizedToADSR(0, 'attack')).toBeCloseTo(0.001, 4)
      })

      it('returns maximum at 1', () => {
        expect(normalizedToADSR(1, 'attack')).toBe(2)
      })
    })

    describe('decay', () => {
      it('returns minimum at 0', () => {
        expect(normalizedToADSR(0, 'decay')).toBeCloseTo(0.01, 4)
      })

      it('returns maximum at 1', () => {
        expect(normalizedToADSR(1, 'decay')).toBe(3)
      })
    })

    describe('release', () => {
      it('returns minimum at 0', () => {
        expect(normalizedToADSR(0, 'release')).toBeCloseTo(0.01, 4)
      })

      it('returns maximum at 1', () => {
        expect(normalizedToADSR(1, 'release')).toBe(5)
      })
    })
  })

  describe('normalizedToDelayTime', () => {
    it('returns same value (0-1 maps to 0-1 seconds)', () => {
      expect(normalizedToDelayTime(0)).toBe(0)
      expect(normalizedToDelayTime(0.5)).toBe(0.5)
      expect(normalizedToDelayTime(1)).toBe(1)
    })
  })

  describe('formatTime', () => {
    it('formats seconds as mm:ss.ms', () => {
      expect(formatTime(0)).toBe('0:00.00')
      expect(formatTime(1)).toBe('0:01.00')
      expect(formatTime(60)).toBe('1:00.00')
      expect(formatTime(65.5)).toBe('1:05.50')
    })

    it('handles edge cases', () => {
      expect(formatTime(0.05)).toBe('0:00.05')
      expect(formatTime(125.25)).toBe('2:05.25')
    })
  })

  describe('formatBeats', () => {
    it('formats beats as bar.beat (1-indexed)', () => {
      expect(formatBeats(0)).toBe('1.1')
      expect(formatBeats(1)).toBe('1.2')
      expect(formatBeats(3)).toBe('1.4')
      expect(formatBeats(4)).toBe('2.1')
    })

    it('handles custom beatsPerBar', () => {
      expect(formatBeats(0, 3)).toBe('1.1')
      expect(formatBeats(3, 3)).toBe('2.1')
      expect(formatBeats(6, 3)).toBe('3.1')
    })
  })
})
