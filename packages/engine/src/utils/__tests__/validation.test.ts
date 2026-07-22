import { describe, it, expect } from 'vitest'
import { validateSoundscapeState, clamp } from '../validation'
import { defaultInstrumentParams } from '../../types'
import type { SoundscapeState } from '../../types'

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
          params: { ...defaultInstrumentParams },
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

    describe('strict validation (0.3.0)', () => {
      const withNote = (noteOverride: object) => ({
        ...validState,
        tracks: [
          {
            ...validState.tracks[0],
            notes: [{ ...validState.tracks[0]!.notes[0], ...noteOverride }],
          },
        ],
      })
      const withParams = (paramsOverride: object) => ({
        ...validState,
        presets: [
          { ...validState.presets[0], params: { ...defaultInstrumentParams, ...paramsOverride } },
        ],
      })

      it('rejects NaN and Infinity tempo', () => {
        expect(validateSoundscapeState({ ...validState, metadata: { ...validState.metadata, tempo: NaN } })).toBe(false)
        expect(validateSoundscapeState({ ...validState, metadata: { ...validState.metadata, tempo: Infinity } })).toBe(false)
      })

      it('rejects NaN lengthBeats', () => {
        expect(validateSoundscapeState({ ...validState, metadata: { ...validState.metadata, lengthBeats: NaN } })).toBe(false)
      })

      it('rejects non-finite time signature entries', () => {
        expect(validateSoundscapeState({ ...validState, metadata: { ...validState.metadata, timeSignature: [NaN, 4] } })).toBe(false)
      })

      it('rejects NaN note fields', () => {
        expect(validateSoundscapeState(withNote({ pitch: NaN }))).toBe(false)
        expect(validateSoundscapeState(withNote({ startTime: NaN }))).toBe(false)
        expect(validateSoundscapeState(withNote({ duration: NaN }))).toBe(false)
        expect(validateSoundscapeState(withNote({ velocity: NaN }))).toBe(false)
      })

      it('rejects presets with an unknown or missing waveform', () => {
        expect(validateSoundscapeState(withParams({ waveform: 'sine2' }))).toBe(false)
        const noWaveform = { ...defaultInstrumentParams } as Record<string, unknown>
        delete noWaveform.waveform
        expect(
          validateSoundscapeState({
            ...validState,
            presets: [{ ...validState.presets[0], params: noWaveform }],
          })
        ).toBe(false)
      })

      it('rejects presets with non-finite numeric params', () => {
        expect(validateSoundscapeState(withParams({ attack: NaN }))).toBe(false)
        expect(validateSoundscapeState(withParams({ filterCutoff: Infinity }))).toBe(false)
      })

      it('rejects presets with invalid optional enums when present', () => {
        expect(validateSoundscapeState(withParams({ filterType: 'sharpen' }))).toBe(false)
        expect(validateSoundscapeState(withParams({ lfoTarget: 'volume' }))).toBe(false)
      })

      it('accepts presets with valid optional fields omitted', () => {
        const minimal = { ...defaultInstrumentParams } as Record<string, unknown>
        delete minimal.filterType
        delete minimal.reverbMix
        delete minimal.lfoRate
        delete minimal.lfoDepth
        delete minimal.lfoTarget
        delete minimal.unisonDetune
        expect(
          validateSoundscapeState({
            ...validState,
            presets: [{ ...validState.presets[0], params: minimal }],
          })
        ).toBe(true)
      })

      it('rejects mixer track entries with non-finite volume or non-boolean flags', () => {
        expect(
          validateSoundscapeState({
            ...validState,
            mixer: { ...validState.mixer, tracks: { 't': { volume: NaN, mute: false, solo: false } } },
          })
        ).toBe(false)
        expect(
          validateSoundscapeState({
            ...validState,
            mixer: { ...validState.mixer, tracks: { 't': { volume: 0.5, mute: 'yes', solo: false } } },
          })
        ).toBe(false)
      })

      it('rejects NaN masterVolume', () => {
        expect(
          validateSoundscapeState({ ...validState, mixer: { ...validState.mixer, masterVolume: NaN } })
        ).toBe(false)
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
