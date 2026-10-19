import { describe, expect, it, vi } from 'vitest'
import { SoundscapeValueError } from 'soundscape-engine'
import { createRuntimeAPI } from '../RuntimeAPI'

/**
 * The runtime API a game drives the editor through refuses a value that
 * cannot play, as the engine does, before anything reaches the editor's
 * state; a value that can play goes through as before.
 */
function api() {
  const dispatch = vi.fn()
  const runtime = createRuntimeAPI(
    dispatch,
    () => ({ mixer: { tracks: {}, masterVolume: 0.8 }, playback: { isPlaying: false, currentBeat: 0, loop: true } }),
    { play: vi.fn(), stop: vi.fn(), setTempo: vi.fn(), setLoop: vi.fn() }
  )
  return { runtime, dispatch }
}

describe('the runtime API', () => {
  it('refuses a NaN override, naming it and its track, and dispatches nothing', () => {
    const { runtime, dispatch } = api()
    expect(() => runtime.applyInstrumentOverride('track-1', { attack: NaN })).toThrow(SoundscapeValueError)
    expect(() => runtime.applyInstrumentOverride('track-1', { attack: NaN })).toThrow(
      "overrides.attack, on track 'track-1': must be from 0 to 1, got NaN"
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('refuses a volume out of range or not a number', () => {
    const { runtime, dispatch } = api()
    expect(() => runtime.setMasterVolume(40)).toThrow('mixer.masterVolume: must be from 0 to 1, got 40')
    expect(() => runtime.setTrackVolume('track-1', -3)).toThrow("mixer.tracks.track-1.volume, on track 'track-1': must be from 0 to 1, got -3")
    expect(() => runtime.applyMixerState({ tracks: { 'track-1': { volume: NaN, mute: false, solo: false } } })).toThrow(
      SoundscapeValueError
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('passes values that can play through, as before', () => {
    const { runtime, dispatch } = api()
    runtime.applyInstrumentOverride('track-1', { filterCutoff: 0.3, delayMix: 0.5 })
    runtime.setTrackVolume('track-1', 0.5)
    runtime.setMasterVolume(0.8)
    runtime.applyMixerState({ tracks: { 'track-1': { volume: 0.5, mute: false, solo: false } }, masterVolume: 0.8 })
    expect(dispatch).toHaveBeenCalledTimes(4)
  })
})
