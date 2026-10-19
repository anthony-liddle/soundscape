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
 * path, before it changes anything; and a value that gets past it, in a
 * state its host changes after handing it over, costs only its own track's
 * notes, never the tracks after it.
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

  it('refuses a mixer value that cannot play in updateMixer', () => {
    engine.updateState(forgettingMachine())
    expect(() => engine.updateMixer({ ...forgettingMachine().mixer, masterVolume: NaN })).toThrow(
      'mixer.masterVolume: must be from 0 to 1, got NaN'
    )
    expect(() =>
      engine.updateMixer({ ...forgettingMachine().mixer, tracks: { track001: { volume: 0.5, mute: 'yes' as never, solo: false } } })
    ).toThrow("mixer.tracks.track001.mute, on track 'track001': must be true or false, got 'yes'")
  })

  it('refuses an override out of range in previewNote and startMIDINote, as Rock Paper Scissors sends', () => {
    engine.updateState(forgettingMachine())
    expect(() => engine.previewNote(48, 100, 'bass', { decay: 1.5 })).toThrow('paramOverrides.decay: must be from 0 to 1, got 1.5')
    expect(() => engine.startMIDINote(60, NaN, 'keys')).toThrow('velocity: must be a velocity from 0 to 127, got NaN')
  })

  it('refuses a tempo or loop length that cannot play', () => {
    expect(() => engine.setTempo(NaN)).toThrow(RangeError)
    expect(() => engine.setTempo(0)).toThrow(RangeError)
    expect(() => engine.setLoopLength(-4)).toThrow(RangeError)
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
