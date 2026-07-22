import { describe, it, expect } from 'vitest'
import { validateSoundscapeState, builtInPresets, defaultInstrumentParams } from 'soundscape-engine'
import { repairSoundscapeState } from '../repairSoundscape'

const validInput = () => ({
  metadata: { name: 'Song', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
  tracks: [
    {
      id: 't1',
      name: 'Track 1',
      presetId: 'lead',
      notes: [{ id: 'n1', pitch: 60, startTime: 0, duration: 1, velocity: 100 }],
    },
  ],
  mixer: { tracks: { t1: { volume: 0.8, mute: false, solo: false } }, masterVolume: 0.8 },
})

describe('repairSoundscapeState', () => {
  it('returns a valid state and no repairs for an already-valid file (presets filled in)', () => {
    const result = repairSoundscapeState(validInput())
    expect(result).not.toBeNull()
    expect(result!.repairs).toEqual([])
    expect(validateSoundscapeState(result!.state)).toBe(true)
    expect(result!.state.presets).toEqual(builtInPresets)
  })

  it('returns null for unrecoverable input', () => {
    expect(repairSoundscapeState(null)).toBeNull()
    expect(repairSoundscapeState('nope')).toBeNull()
    expect(repairSoundscapeState({ metadata: {}, tracks: 'not-an-array' })).toBeNull()
  })

  it('drops invalid notes and reports how many', () => {
    const input = validInput()
    input.tracks[0]!.notes.push(
      { id: 'bad1', pitch: NaN, startTime: 0, duration: 1, velocity: 100 },
      { id: 'bad2', pitch: 60, startTime: -5, duration: 1, velocity: 100 }
    )
    const result = repairSoundscapeState(input)!
    expect(result.state.tracks[0]!.notes).toHaveLength(1)
    expect(result.repairs.some((r) => r.includes('2 invalid note'))).toBe(true)
    expect(validateSoundscapeState(result.state)).toBe(true)
  })

  it('resets invalid tempo and lengthBeats to defaults', () => {
    const input = validInput()
    input.metadata.tempo = NaN
    input.metadata.lengthBeats = 0
    const result = repairSoundscapeState(input)!
    expect(result.state.metadata.tempo).toBe(120)
    expect(result.state.metadata.lengthBeats).toBe(16)
    expect(result.repairs.length).toBeGreaterThanOrEqual(2)
    expect(validateSoundscapeState(result.state)).toBe(true)
  })

  it('drops invalid custom presets and reassigns orphaned tracks to the first preset', () => {
    const input = validInput() as Record<string, unknown>
    input.presets = [
      { id: 'custom', name: 'Custom', isBuiltIn: false, params: { ...defaultInstrumentParams, waveform: 'laser' } },
    ]
    ;(input.tracks as Array<{ presetId: string }>)[0]!.presetId = 'custom'
    const result = repairSoundscapeState(input)!
    expect(result.state.presets.some((p) => p.id === 'custom')).toBe(false)
    const reassigned = result.state.tracks[0]!.presetId
    expect(result.state.presets.some((p) => p.id === reassigned)).toBe(true)
    expect(validateSoundscapeState(result.state)).toBe(true)
  })

  it('rebuilds missing or invalid mixer entries and clamps volumes', () => {
    const input = validInput() as Record<string, unknown>
    input.mixer = {
      tracks: { t1: { volume: 4, mute: false, solo: false } },
      masterVolume: NaN,
    }
    const result = repairSoundscapeState(input)!
    expect(result.state.mixer.masterVolume).toBe(0.8)
    expect(result.state.mixer.tracks.t1!.volume).toBe(1)
    expect(validateSoundscapeState(result.state)).toBe(true)
  })

  it('keeps valid custom presets from the file', () => {
    const input = validInput() as Record<string, unknown>
    input.presets = [
      { id: 'mine', name: 'Mine', isBuiltIn: false, params: { ...defaultInstrumentParams } },
    ]
    const result = repairSoundscapeState(input)!
    expect(result.state.presets.some((p) => p.id === 'mine')).toBe(true)
    expect(validateSoundscapeState(result.state)).toBe(true)
  })
})
