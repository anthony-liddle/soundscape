import { afterEach, describe, expect, it, vi } from 'vitest'
import { SoundscapeValueError } from 'soundscape-engine'
import { createRuntimeAPI } from '../RuntimeAPI'

/**
 * The runtime API a game drives the editor through refuses a value that
 * cannot play, as the engine does, before anything reaches the editor's
 * state. A game calls it while the music plays, so it skips the call and
 * reports it, and never throws into the game; a value that can play goes
 * through as before.
 */
function api() {
  const dispatch = vi.fn()
  const setTempo = vi.fn()
  const runtime = createRuntimeAPI(
    dispatch,
    () => ({ mixer: { tracks: {}, masterVolume: 0.8 }, playback: { isPlaying: false, currentBeat: 0, loop: true } }),
    { play: vi.fn(), stop: vi.fn(), setTempo, setLoop: vi.fn() }
  )
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
  const messages = () => reported.mock.calls.map(([e]) => String(e))
  return { runtime, dispatch, setTempo, reported, messages }
}

afterEach(() => vi.restoreAllMocks())

describe('the runtime API', () => {
  it('skips a NaN override, reporting it and its track once, and dispatches nothing', () => {
    const { runtime, dispatch, reported, messages } = api()
    expect(() => runtime.applyInstrumentOverride('track-1', { attack: NaN })).not.toThrow()
    expect(reported).toHaveBeenCalledOnce()
    expect(reported.mock.calls[0]![0]).toBeInstanceOf(SoundscapeValueError)
    expect(messages()[0]).toContain("overrides.attack, on track 'track-1': must be from 0 to 1, got NaN")
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('skips a volume out of range or not a number', () => {
    const { runtime, dispatch, messages } = api()
    expect(() => runtime.setMasterVolume(40)).not.toThrow()
    expect(() => runtime.setTrackVolume('track-1', -3)).not.toThrow()
    expect(() => runtime.applyMixerState({ tracks: { 'track-1': { volume: NaN, mute: false, solo: false } } })).not.toThrow()
    expect(messages()).toEqual([
      expect.stringContaining('mixer.masterVolume: must be from 0 to 1, got 40'),
      expect.stringContaining("mixer.tracks.track-1.volume, on track 'track-1': must be from 0 to 1, got -3"),
      expect.stringContaining("mixer.tracks.track-1.volume, on track 'track-1': must be from 0 to 1, got NaN"),
    ])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('skips a mute or solo that is not true or false', () => {
    const { runtime, dispatch, messages } = api()
    expect(() => runtime.muteTrack('track-1', 'yes' as never)).not.toThrow()
    expect(() => runtime.soloTrack('track-1', 1 as never)).not.toThrow()
    expect(messages()).toEqual([
      expect.stringContaining("mixer.tracks.track-1.mute, on track 'track-1': must be true or false, got 'yes'"),
      expect.stringContaining("mixer.tracks.track-1.solo, on track 'track-1': must be true or false, got 1"),
    ])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('skips a tempo that cannot play, and never passes it on', () => {
    const { runtime, setTempo, messages } = api()
    expect(() => runtime.setTempo(NaN)).not.toThrow()
    expect(() => runtime.setTempo(0)).not.toThrow()
    expect(messages()).toEqual([
      expect.stringContaining('bpm: must be a tempo above 0 beats a minute, got NaN'),
      expect.stringContaining('bpm: must be a tempo above 0 beats a minute, got 0'),
    ])
    expect(setTempo).not.toHaveBeenCalled()
  })

  it('passes values that can play through, as before, reporting nothing', () => {
    const { runtime, dispatch, setTempo, reported } = api()
    runtime.applyInstrumentOverride('track-1', { filterCutoff: 0.3, delayMix: 0.5 })
    runtime.setTrackVolume('track-1', 0.5)
    runtime.setMasterVolume(0.8)
    runtime.applyMixerState({ tracks: { 'track-1': { volume: 0.5, mute: false, solo: false } }, masterVolume: 0.8 })
    runtime.muteTrack('track-1', true)
    runtime.soloTrack('track-1', false)
    runtime.setTempo(96)
    expect(dispatch).toHaveBeenCalledTimes(6)
    expect(setTempo).toHaveBeenCalledWith(96)
    expect(reported).not.toHaveBeenCalled()
  })
})
