import { describe, it, expect } from 'vitest'
import { validateSoundscapeState } from '../validation'
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
})
