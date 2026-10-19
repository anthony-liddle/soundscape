import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AudioEngine } from '../AudioEngine'
import { builtInPresets } from '../../presets'
import type { SoundscapeState } from '../../types'
import { SoundscapeValueError, stateValueProblems } from '../../utils/values'
import { createMockAudioContext } from './mockWebAudio'
import type { MockAudioContext } from './mockWebAudio'

/**
 * The runtime API refuses a value that cannot play, with every problem's
 * path, before it changes anything. updateState throws; a call made while
 * the music plays skips what it was asked and reports it, and returns to its
 * caller. A value that gets past both, in a state its host changes after
 * handing it over, costs only its own track's notes, never the tracks after
 * it.
 */
const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../../../conformance/songs/fixtures/${name}`), 'utf8'))

/** The Forgetting Machine as it plays: its song with the engine's built-in presets. */
const forgettingMachine = (): SoundscapeState => ({ ...fixture('the-forgetting-machine.json'), presets: [...builtInPresets] })

describe("the songs the games play", () => {
  it('hold nothing the runtime API refuses', () => {
    expect(stateValueProblems(forgettingMachine())).toEqual([])
    expect(stateValueProblems(fixture('rock-paper-scissors.json'))).toEqual([])
  })
})

describe('the runtime API', () => {
  let ctx: MockAudioContext
  let engine: AudioEngine

  beforeEach(async () => {
    ctx = createMockAudioContext()
    engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
  })
  afterEach(() => vi.restoreAllMocks())

  it('refuses a NaN override in updateState, naming its path and track, and changes nothing', () => {
    const state = forgettingMachine()
    state.tracks[0]!.paramOverrides = { attack: NaN }
    const made = ctx.createdNodes.length
    expect(() => engine.updateState(state)).toThrow(SoundscapeValueError)
    expect(() => engine.updateState(state)).toThrow(
      "tracks[0].paramOverrides.attack, on track 'track001': must be from 0 to 1, got NaN"
    )
    // No track channel was built, nothing was kept
    expect(ctx.createdNodes.length).toBe(made)
    engine.play()
    expect(engine.getIsPlaying()).toBe(false)
  })

  it('refuses every value that cannot play at once, each with its path', () => {
    const state = forgettingMachine()
    state.tracks[0]!.paramOverrides = { release: 'long' as unknown as number, waveform: 'noise' as never, filterCutoff: 5 }
    state.presets[0] = { ...state.presets[0]!, params: { ...state.presets[0]!.params, sustain: -1 } }
    state.mixer = { ...state.mixer, masterVolume: 40 }
    state.mixer.tracks.track002 = { volume: -3, mute: false, solo: false }
    let error: SoundscapeValueError | undefined
    try {
      engine.updateState(state)
    } catch (e) {
      error = e as SoundscapeValueError
    }
    expect(error?.problems.map((p) => p.path)).toEqual([
      'presets[0].params.sustain',
      'tracks[0].paramOverrides.release',
      'tracks[0].paramOverrides.filterCutoff',
      'tracks[0].paramOverrides.waveform',
      'mixer.masterVolume',
      'mixer.tracks.track002.volume',
    ])
  })

  /** Every call to a gain's setValueAtTime so far, across every node made. */
  const gainSets = () =>
    ctx.createdNodes.reduce((n, node) => n + ((node as { gain?: { setValueAtTime: { mock: { calls: unknown[] } } } }).gain?.setValueAtTime.mock.calls.length ?? 0), 0)

  it('skips a mixer update holding a value that cannot play, reports it once, and changes nothing', () => {
    engine.updateState(forgettingMachine())
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sets = gainSets()
    expect(() => engine.updateMixer({ ...forgettingMachine().mixer, masterVolume: NaN })).not.toThrow()
    expect(() =>
      engine.updateMixer({ ...forgettingMachine().mixer, tracks: { track001: { volume: 0.5, mute: 'yes' as never, solo: false } } })
    ).not.toThrow()
    expect(gainSets()).toBe(sets)
    expect(reported).toHaveBeenCalledTimes(2)
    expect(reported.mock.calls[0]![0]).toBeInstanceOf(SoundscapeValueError)
    expect(String(reported.mock.calls[0]![0])).toContain('updateMixer refused')
    expect(String(reported.mock.calls[0]![0])).toContain('mixer.masterVolume: must be from 0 to 1, got NaN')
    expect(String(reported.mock.calls[1]![0])).toContain("mixer.tracks.track001.mute, on track 'track001': must be true or false, got 'yes'")
    // A mixer that can play goes through, as before
    engine.updateMixer(forgettingMachine().mixer)
    expect(gainSets()).toBeGreaterThan(sets)
  })

  it('skips a live MIDI note that cannot play, reports it once, and plays nothing', () => {
    engine.updateState(forgettingMachine())
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const made = ctx.createdNodes.length
    expect(() => engine.startMIDINote(60, NaN, 'keys')).not.toThrow()
    expect(ctx.createdNodes.length).toBe(made)
    expect(reported).toHaveBeenCalledOnce()
    expect(String(reported.mock.calls[0]![0])).toContain('startMIDINote refused')
    expect(String(reported.mock.calls[0]![0])).toContain('velocity: must be a velocity from 0 to 127, got NaN')
  })

  it('skips a tempo or loop length that cannot play, reports each once, and keeps what it had', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const kept = engine as unknown as { tempo: number; loopLengthBeats: number }
    const { tempo, loopLengthBeats } = kept
    for (const bpm of [NaN, 0]) expect(() => engine.setTempo(bpm)).not.toThrow()
    expect(() => engine.setLoopLength(-4)).not.toThrow()
    expect(kept.tempo).toBe(tempo)
    expect(kept.loopLengthBeats).toBe(loopLengthBeats)
    expect(reported).toHaveBeenCalledTimes(3)
    expect(reported.mock.calls.map(([e]) => String(e))).toEqual([
      expect.stringContaining('bpm: must be a tempo above 0 beats a minute, got NaN'),
      expect.stringContaining('bpm: must be a tempo above 0 beats a minute, got 0'),
      expect.stringContaining('beats: must be a length above 0 beats, got -4'),
    ])
    // A tempo and length that can play go through, as before
    engine.setTempo(90)
    engine.setLoopLength(8)
    expect(kept.tempo).toBe(90)
    expect(kept.loopLengthBeats).toBe(8)
  })

  it("reports through the host's reportError where it has one, and not console.error", () => {
    engine.updateState(forgettingMachine())
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      engine.previewNote(48, 100, 'bass', { decay: 1.5 })
      expect(reportError).toHaveBeenCalledOnce()
      expect(reportError.mock.calls[0]![0]).toBeInstanceOf(SoundscapeValueError)
      expect(logged).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("Rock Paper Scissors' ending-broken, through previewNote", () => {
  // The ending's three calls as the game's musicManager.ts makes them: each
  // passes a decay above 1, and the last two a release above 1 too
  const endingBroken = (engine: AudioEngine) => {
    engine.previewNote(48, 100, 'bass', { distortion: 0.4, filterCutoff: 0.3, attack: 0.01, decay: 1.5, sustain: 0.1, release: 1.0 })
    engine.previewNote(36, 110, 'percussion', { distortion: 0.5, attack: 0.1, decay: 2.0, sustain: 0.05, release: 1.5 })
    engine.previewNote(24, 90, 'bass', { filterCutoff: 0.15, attack: 0.3, decay: 2.5, sustain: 0, release: 2.0 })
  }

  afterEach(() => vi.restoreAllMocks())

  it('plays nothing, reports each note once, and returns to the game', async () => {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    engine.updateState(fixture('rock-paper-scissors.json'))
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const made = ctx.createdNodes.length
    expect(() => endingBroken(engine)).not.toThrow()
    // No voice, no gain: nothing sounds
    expect(ctx.createdNodes.length).toBe(made)
    expect(reported).toHaveBeenCalledTimes(3)
    const [first, second, third] = reported.mock.calls.map(([e]) => String(e))
    expect(first).toContain('previewNote refused')
    expect(first).toContain('paramOverrides.decay: must be from 0 to 1, got 1.5')
    expect(second).toContain('paramOverrides.decay: must be from 0 to 1, got 2')
    expect(second).toContain('paramOverrides.release: must be from 0 to 1, got 1.5')
    expect(third).toContain('paramOverrides.decay: must be from 0 to 1, got 2.5')
    expect(third).toContain('paramOverrides.release: must be from 0 to 1, got 2')
  })
})

describe('a value slipped in after updateState', () => {
  // Two tracks, each with a note at beat 0, the bad one first
  const twoTracks = (): SoundscapeState => ({
    metadata: { name: 'Two', tempo: 120, timeSignature: [4, 4], lengthBeats: 4 },
    presets: [...builtInPresets],
    tracks: ['bad', 'good'].map((id) => ({
      id,
      name: id,
      presetId: 'keys',
      notes: [{ id: `${id}-0`, pitch: 60, startTime: 0, duration: 1, velocity: 100 }],
    })),
    mixer: { tracks: { bad: { volume: 1, mute: false, solo: false }, good: { volume: 1, mute: false, solo: false } }, masterVolume: 1 },
  })

  it("costs only its own track's notes, reported once each, and the tracks after it play", async () => {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    const state = twoTracks()
    engine.updateState(state)
    // A host changing its own state after handing it over: the engine reads
    // it as it schedules, past what updateState checked
    state.tracks[0]!.paramOverrides = { attack: NaN }
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = ctx.createdNodes.length
    engine.play()
    expect(engine.getIsPlaying()).toBe(true)
    // The good track's note was started, after the bad one's failed
    const voices = (engine as unknown as { trackChannels: Map<string, { activeVoices: Map<string, unknown> }> }).trackChannels
    expect(voices.get('good')!.activeVoices.has('good-0|0')).toBe(true)
    expect(voices.get('bad')!.activeVoices.size).toBe(0)
    expect(ctx.createdNodes.length).toBeGreaterThan(before)
    expect(reported).toHaveBeenCalledOnce()
    expect(String(reported.mock.calls[0]![0])).toMatch(/track 'bad', note 'bad-0'/i)
    // A note that failed is not tried again at the next tick
    ;(engine as unknown as { scheduleNotes: () => void }).scheduleNotes()
    expect(reported).toHaveBeenCalledOnce()
  })
})
