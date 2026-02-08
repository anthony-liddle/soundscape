import { describe, it, expect } from 'vitest'
import { validateSoundscapeState, clamp } from '@/utils/validation'
import type { SoundscapeState } from '@/types'

describe('validation utilities', () => {
  describe('clamp', () => {
    it('returns value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })

    it('clamps to min when below', () => {
      expect(clamp(-5, 0, 10)).toBe(0)
    })

    it('clamps to max when above', () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('handles edge cases', () => {
      expect(clamp(0, 0, 10)).toBe(0)
      expect(clamp(10, 0, 10)).toBe(10)
    })

    it('works with negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5)
      expect(clamp(0, -10, -1)).toBe(-1)
    })
  })

  describe('validateSoundscapeState', () => {
    const validState: SoundscapeState = {
      metadata: {
        name: 'Test',
        tempo: 120,
        timeSignature: [4, 4],
        lengthBeats: 16,
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Track 1',
          presetId: 'lead',
          notes: [
            {
              id: 'note-1',
              pitch: 60,
              startTime: 0,
              duration: 1,
              velocity: 100,
            },
          ],
        },
      ],
      presets: [
        {
          id: 'lead',
          name: 'Lead',
          isBuiltIn: true,
          params: {},
        },
      ],
      mixer: {
        tracks: {
          'track-1': {
            volume: 0.8,
            mute: false,
            solo: false,
          },
        },
        masterVolume: 0.8,
      },
    }

    it('returns true for valid state', () => {
      expect(validateSoundscapeState(validState)).toBe(true)
    })

    it('returns false for null/undefined', () => {
      expect(validateSoundscapeState(null)).toBe(false)
      expect(validateSoundscapeState(undefined)).toBe(false)
    })

    it('returns false for non-object', () => {
      expect(validateSoundscapeState('string')).toBe(false)
      expect(validateSoundscapeState(123)).toBe(false)
    })

    describe('metadata validation', () => {
      it('returns false for missing metadata', () => {
        const state = { ...validState, metadata: undefined }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for invalid tempo', () => {
        const state = {
          ...validState,
          metadata: { ...validState.metadata, tempo: 0 },
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for negative tempo', () => {
        const state = {
          ...validState,
          metadata: { ...validState.metadata, tempo: -120 },
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for invalid time signature', () => {
        const state = {
          ...validState,
          metadata: { ...validState.metadata, timeSignature: [4] as unknown as [number, number] },
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for invalid lengthBeats', () => {
        const state = {
          ...validState,
          metadata: { ...validState.metadata, lengthBeats: 0 },
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })
    })

    describe('track validation', () => {
      it('returns false for non-array tracks', () => {
        const state = { ...validState, tracks: 'not-array' }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for track missing id', () => {
        const state = {
          ...validState,
          tracks: [{ ...validState.tracks[0], id: undefined }],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for track missing name', () => {
        const state = {
          ...validState,
          tracks: [{ ...validState.tracks[0], name: undefined }],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })
    })

    describe('note validation', () => {
      it('returns false for invalid pitch (negative)', () => {
        const state = {
          ...validState,
          tracks: [
            {
              ...validState.tracks[0],
              notes: [{ ...validState.tracks[0].notes[0], pitch: -1 }],
            },
          ],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for invalid pitch (> 127)', () => {
        const state = {
          ...validState,
          tracks: [
            {
              ...validState.tracks[0],
              notes: [{ ...validState.tracks[0].notes[0], pitch: 128 }],
            },
          ],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for invalid duration (0)', () => {
        const state = {
          ...validState,
          tracks: [
            {
              ...validState.tracks[0],
              notes: [{ ...validState.tracks[0].notes[0], duration: 0 }],
            },
          ],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for invalid velocity', () => {
        const state = {
          ...validState,
          tracks: [
            {
              ...validState.tracks[0],
              notes: [{ ...validState.tracks[0].notes[0], velocity: -1 }],
            },
          ],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })
    })

    describe('preset validation', () => {
      it('returns false for non-array presets', () => {
        const state = { ...validState, presets: 'not-array' }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for preset missing isBuiltIn', () => {
        const state = {
          ...validState,
          presets: [{ ...validState.presets[0], isBuiltIn: undefined }],
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })
    })

    describe('mixer validation', () => {
      it('returns false for missing mixer', () => {
        const state = { ...validState, mixer: undefined }
        expect(validateSoundscapeState(state)).toBe(false)
      })

      it('returns false for missing masterVolume', () => {
        const state = {
          ...validState,
          mixer: { ...validState.mixer, masterVolume: undefined },
        }
        expect(validateSoundscapeState(state)).toBe(false)
      })
    })
  })
})
