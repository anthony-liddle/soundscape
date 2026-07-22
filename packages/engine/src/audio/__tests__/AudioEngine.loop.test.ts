import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import { builtInPresets, keysPreset } from '../../presets'
import { createNote, createTrack } from '../../types'
import type { SoundscapeState, Note } from '../../types'
import { normalizedToADSR } from '../../utils/time'
import { createMockAudioContext } from './mockWebAudio'
import type { MockAudioContext, MockNode } from './mockWebAudio'

/**
 * Loop-boundary scheduling. Tempo is 120 BPM and lengthBeats is 2, so one
 * loop iteration is exactly 1 second — beat N of iteration I lands at
 * (N / 2 + I) seconds. The engine runs on the setInterval fallback under
 * fake timers; ctx.currentTime is stepped manually in 25 ms increments.
 */

function makeState(notes: Array<Pick<Note, 'pitch' | 'startTime' | 'duration'>>): SoundscapeState {
  // 'keys' preset: no unison and no LFO, so each noteOn creates exactly one oscillator
  const track = { ...createTrack('T', 'keys'), id: 'trk-loop' }
  for (const n of notes) track.notes.push(createNote(n.pitch, n.startTime, n.duration, 100))
  return {
    metadata: { name: 't', tempo: 120, timeSignature: [4, 4], lengthBeats: 2 },
    tracks: [track],
    presets: builtInPresets,
    mixer: { tracks: { 'trk-loop': { volume: 0.8, mute: false, solo: false } }, masterVolume: 0.8 },
  }
}

describe('AudioEngine loop scheduling', () => {
  let engine: AudioEngine
  let ctx: MockAudioContext

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', function (this: unknown) {
      ctx = createMockAudioContext()
      return ctx
    })
  })

  afterEach(() => {
    engine?.destroy()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function runTo(targetSec: number) {
    while (ctx.currentTime < targetSec - 1e-9) {
      ctx.currentTime = Math.min(targetSec, ctx.currentTime + 0.025)
      vi.advanceTimersByTime(25)
    }
  }

  const toneOscs = (): MockNode[] =>
    ctx.createdNodes.filter((n) => n.kind === 'oscillator' && n.started.length > 0)
  const startTimes = (): number[] => toneOscs().flatMap((o) => o.started).sort((a, b) => a - b)

  async function playState(state: SoundscapeState) {
    engine = new AudioEngine()
    await engine.initialize()
    engine.updateState(state)
    engine.play()
  }

  it('schedules the next iteration downbeat BEFORE the loop boundary passes', async () => {
    await playState(makeState([{ pitch: 60, startTime: 0, duration: 0.5 }]))

    // Run to just before the boundary: iteration 1's downbeat (t = 1.0 s)
    // enters the 100 ms lookahead at t = 0.9
    runTo(0.98)

    const starts = startTimes()
    expect(starts).toHaveLength(2)
    expect(starts[0]).toBeCloseTo(0, 5)
    expect(starts[1]).toBeCloseTo(1.0, 5) // exact, scheduled ahead — not late
  })

  it('plays each loop iteration exactly once at the exact boundary time', async () => {
    await playState(makeState([{ pitch: 60, startTime: 0, duration: 0.5 }]))

    runTo(2.6)

    const starts = startTimes()
    // Iterations 0, 1, 2 — no double-triggers, no missed or late downbeats
    expect(starts).toHaveLength(3)
    expect(starts[0]).toBeCloseTo(0, 5)
    expect(starts[1]).toBeCloseTo(1.0, 5)
    expect(starts[2]).toBeCloseTo(2.0, 5)
  })

  it('a note sustained across the loop boundary still receives its note-off', async () => {
    // Note at beat 1.5 (t = 0.75), duration 1 beat — ends at absolute beat
    // 2.5 (t = 1.25), half a beat INTO iteration 1
    await playState(makeState([{ pitch: 60, startTime: 1.5, duration: 1 }]))

    runTo(1.4)

    const firstOsc = toneOscs().find((o) => Math.abs(o.started[0]! - 0.75) < 1e-6)!
    expect(firstOsc).toBeDefined()

    // Old behavior: the wrap reset scheduling flags and the iteration-1
    // restart overwrote the activeVoices entry, so this oscillator never got
    // a stop and sustained forever
    const release = normalizedToADSR(keysPreset.params.release, 'release')
    expect(firstOsc.stopped).toHaveLength(1)
    expect(firstOsc.stopped[0]!).toBeCloseTo(1.25 + release + 0.01, 5)

    // And the next iteration's occurrence still starts on time (t = 1.75)
    runTo(1.8)
    const starts = startTimes()
    expect(starts).toHaveLength(2)
    expect(starts[1]).toBeCloseTo(1.75, 5)
  })

  it('stays exactly-once over many iterations (double-trigger soak)', async () => {
    await playState(
      makeState([
        { pitch: 60, startTime: 0, duration: 0.5 },
        { pitch: 64, startTime: 1, duration: 0.5 },
      ])
    )

    runTo(10.4) // iterations 0–10 for the downbeat, 0–9 for the mid-loop note

    const starts = startTimes()
    expect(starts).toHaveLength(11 + 10)
    // Every start lands exactly on its grid position — never late, never doubled
    for (const t of starts) {
      const gridOffset = Math.min(t % 0.5, 0.5 - (t % 0.5))
      expect(gridOffset).toBeLessThan(1e-9)
    }
  })

  it('does not schedule beyond iteration 0 when loop is disabled', async () => {
    await playState(makeState([{ pitch: 60, startTime: 0, duration: 0.5 }]))
    engine.setLoop(false)

    runTo(2.6)

    expect(startTimes()).toHaveLength(1)
  })
})
