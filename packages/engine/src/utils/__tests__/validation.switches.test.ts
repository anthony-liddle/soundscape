import { describe, it, expect } from 'vitest'
import { soundscapeInstrumentProblems, validateSoundscapeState } from '../validation'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams, SoundscapeState } from '../../types'

/**
 * The 0.4.0 instrument fields in a state file: an exponential envelope with
 * its floor, and a filter type of 'none'. Each is optional, and a file that
 * validated before 0.4.0 cannot contain any of them, so these rules can only
 * reject new data.
 */
function stateWith(params: Record<string, unknown>): SoundscapeState {
  return {
    metadata: { name: 'Test', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
    tracks: [],
    presets: [{ id: 'p', name: 'P', isBuiltIn: false, params: { ...defaultInstrumentParams, ...params } as InstrumentParams }],
    mixer: { tracks: {}, masterVolume: 0.8 },
  }
}

describe('0.4.0 instrument fields in a state file', () => {
  it('accepts a preset without any of them, as before', () => {
    expect(validateSoundscapeState(stateWith({}))).toBe(true)
  })

  it("accepts filterType 'none'", () => {
    expect(validateSoundscapeState(stateWith({ filterType: 'none' }))).toBe(true)
  })

  it('accepts an exponential envelope with a floor between 0 and 1', () => {
    expect(validateSoundscapeState(stateWith({ envelopeCurve: 'exponential', envelopeFloor: 1e-4 }))).toBe(true)
    expect(validateSoundscapeState(stateWith({ envelopeCurve: 'linear' }))).toBe(true)
  })

  it('rejects an unknown envelope curve', () => {
    expect(validateSoundscapeState(stateWith({ envelopeCurve: 'logarithmic' }))).toBe(false)
  })

  it('rejects an exponential envelope with no floor, or a floor out of range', () => {
    expect(validateSoundscapeState(stateWith({ envelopeCurve: 'exponential' }))).toBe(false)
    for (const floor of [0, -1e-4, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateSoundscapeState(stateWith({ envelopeCurve: 'exponential', envelopeFloor: floor }))).toBe(false)
    }
  })

  it('rejects a floor on an envelope that is not exponential', () => {
    expect(validateSoundscapeState(stateWith({ envelopeFloor: 1e-4 }))).toBe(false)
    expect(validateSoundscapeState(stateWith({ envelopeCurve: 'linear', envelopeFloor: 1e-4 }))).toBe(false)
  })

  it("rejects an LFO aimed at the filter when filterType is 'none'", () => {
    expect(validateSoundscapeState(stateWith({ filterType: 'none', lfoDepth: 0.3 }))).toBe(false)
    expect(validateSoundscapeState(stateWith({ filterType: 'none', lfoDepth: 0.3, lfoTarget: 'filter' }))).toBe(false)
    // Aimed at pitch, or switched off, the LFO still means something
    expect(validateSoundscapeState(stateWith({ filterType: 'none', lfoDepth: 0.3, lfoTarget: 'pitch' }))).toBe(true)
    expect(validateSoundscapeState(stateWith({ filterType: 'none', lfoDepth: 0 }))).toBe(true)
  })

  describe('on a track, where overrides change the instrument it plays', () => {
    const withOverrides = (presetParams: Record<string, unknown>, overrides: Record<string, unknown>) => {
      const state = stateWith(presetParams)
      state.tracks.push({ id: 't', name: 'T', presetId: 'p', notes: [], paramOverrides: overrides as never })
      return state
    }

    it('accepts overrides that leave the instrument valid', () => {
      expect(validateSoundscapeState(withOverrides({}, { envelopeCurve: 'exponential', envelopeFloor: 1e-4 }))).toBe(true)
      expect(validateSoundscapeState(withOverrides({ envelopeCurve: 'exponential', envelopeFloor: 1e-4 }, { attack: 0.2 }))).toBe(true)
    })

    it('rejects an override that switches on an exponential envelope with no floor', () => {
      // Playing it would throw on every scheduler tick, so it is refused at load
      expect(validateSoundscapeState(withOverrides({}, { envelopeCurve: 'exponential' }))).toBe(false)
      expect(validateSoundscapeState(withOverrides({}, { envelopeCurve: 'exponential', envelopeFloor: 0 }))).toBe(false)
    })

    it("rejects an override that takes the filter away from an LFO aimed at it", () => {
      expect(validateSoundscapeState(withOverrides({ lfoDepth: 0.3 }, { filterType: 'none' }))).toBe(false)
    })

    it('leaves tracks without overrides, and overrides without the new fields, alone', () => {
      expect(validateSoundscapeState(withOverrides({}, { attack: 0.5, filterCutoff: 0.2 }))).toBe(true)
    })
  })
})

describe('decayUntilRelease, which only a cue can play', () => {
  const ONLY_CUES = 'is only for cue instruments: the transport starts a note without knowing when it will be released'

  it('is refused on a preset at load, with the path to it, rather than failing the note at play', () => {
    const state = stateWith({ decayUntilRelease: true })
    expect(validateSoundscapeState(state)).toBe(false)
    expect(soundscapeInstrumentProblems(state)).toEqual([{ path: 'presets[0].params.decayUntilRelease', message: ONLY_CUES }])
  })

  it("is refused in a track's overrides, with the path to it", () => {
    const state = stateWith({})
    state.tracks.push({ id: 't', name: 'T', presetId: 'p', notes: [], paramOverrides: { decayUntilRelease: true } as never })
    expect(validateSoundscapeState(state)).toBe(false)
    expect(soundscapeInstrumentProblems(state)).toEqual([
      { path: 'tracks[0].paramOverrides.decayUntilRelease', message: ONLY_CUES },
    ])
  })

  it('is refused whatever its value, since a preset has no such field', () => {
    expect(soundscapeInstrumentProblems(stateWith({ decayUntilRelease: false }))).toEqual([
      { path: 'presets[0].params.decayUntilRelease', message: ONLY_CUES },
    ])
  })
})

describe('soundscapeInstrumentProblems', () => {
  it('names the path to a value the 0.4.0 instrument rules reject', () => {
    expect(soundscapeInstrumentProblems(stateWith({ envelopeCurve: 'exponential' }))).toEqual([
      { path: 'presets[0].params.envelopeFloor', message: 'an exponential envelope needs a floor between 0 and 1, exclusive' },
    ])
  })

  it("names a track's override, or the overrides when the value at fault is the preset's", () => {
    const withOverrides = (presetParams: Record<string, unknown>, overrides: Record<string, unknown>) => {
      const state = stateWith(presetParams)
      state.tracks.push({ id: 't', name: 'T', presetId: 'p', notes: [], paramOverrides: overrides as never })
      return state
    }
    expect(soundscapeInstrumentProblems(withOverrides({}, { envelopeCurve: 'exponential', envelopeFloor: 0 }))).toEqual([
      { path: 'tracks[0].paramOverrides.envelopeFloor', message: 'an exponential envelope needs a floor between 0 and 1, exclusive' },
    ])
    expect(soundscapeInstrumentProblems(withOverrides({ lfoDepth: 0.3 }, { filterType: 'none' }))).toEqual([
      {
        path: 'tracks[0].paramOverrides',
        message: "with these overrides, lfoTarget: an LFO aimed at the filter does nothing when filterType is 'none'",
      },
    ])
    // A problem the preset has on its own is named once, at the preset
    expect(soundscapeInstrumentProblems(withOverrides({ envelopeCurve: 'exponential' }, { attack: 0.2 })).map((p) => p.path)).toEqual([
      'presets[0].params.envelopeFloor',
    ])
  })

  it('finds nothing in a state that validates', () => {
    expect(soundscapeInstrumentProblems(stateWith({}))).toEqual([])
  })
})
