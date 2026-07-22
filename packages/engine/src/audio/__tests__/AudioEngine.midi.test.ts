import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import { builtInPresets, keysPreset } from '../../presets'
import { createTrack } from '../../types'
import type { SoundscapeState } from '../../types'
import { normalizedToADSR } from '../../utils/time'
import { createMockAudioContext } from './mockWebAudio'
import type { MockAudioContext, MockNode } from './mockWebAudio'

/**
 * startMIDINote / stopMIDINote: sustained interactive voices for live MIDI
 * input. Unlike previewNote, these hold until explicitly released, live
 * outside the transport (playback stop must not silence a held key), and are
 * force-cleaned on destroy().
 */

function makeState(): SoundscapeState {
  const track = { ...createTrack('T', 'keys'), id: 'trk-midi' }
  return {
    metadata: { name: 't', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
    tracks: [track],
    presets: builtInPresets,
    mixer: { tracks: { 'trk-midi': { volume: 0.8, mute: false, solo: false } }, masterVolume: 0.8 },
  }
}

describe('AudioEngine MIDI notes', () => {
  let engine: AudioEngine
  let ctx: MockAudioContext

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', function (this: unknown) {
      ctx = createMockAudioContext()
      return ctx
    })
    engine = new AudioEngine()
    await engine.initialize()
    engine.updateState(makeState())
  })

  afterEach(() => {
    engine?.destroy()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const oscs = (): MockNode[] =>
    ctx.createdNodes.filter((n) => n.kind === 'oscillator' && n.started.length > 0)

  it('sustains a note until explicitly released (no auto-release)', () => {
    engine.startMIDINote(60, 100, 'keys')
    expect(oscs()).toHaveLength(1)

    // previewNote would have released after 500 ms and cleaned up after the
    // tail; a held MIDI note must survive indefinitely
    vi.advanceTimersByTime(5000)
    expect(oscs()[0]!.stop).not.toHaveBeenCalled()
  })

  it('applies preset params with per-note velocity and overrides', () => {
    engine.startMIDINote(60, 127, 'keys', { waveform: 'square' })
    const osc = oscs()[0]!
    expect(osc.type).toBe('square')

    engine.startMIDINote(64, 32, 'keys')
    // 'keys' has velocityResponse 0.8 — quieter velocity => lower attack peak
    const gains = ctx.createdNodes.filter((n) => n.kind === 'gain')
    const ramps = gains
      .flatMap((g) => g.gain.calls)
      .filter((c) => c.method === 'ramp' && c.value !== 0)
      .map((c) => c.value!)
    const loud = Math.max(...ramps)
    const quiet = Math.min(...ramps)
    expect(quiet).toBeLessThan(loud)
  })

  it('stopMIDINote releases the note and schedules oscillator stop', () => {
    engine.startMIDINote(60, 100, 'keys')
    const osc = oscs()[0]!

    ctx.currentTime = 2
    engine.stopMIDINote(60)

    const release = normalizedToADSR(keysPreset.params.release, 'release')
    expect(osc.stopped[0]!).toBeCloseTo(2 + release + 0.01, 5)
  })

  it('stopMIDINote for a pitch that is not held is a no-op', () => {
    expect(() => engine.stopMIDINote(72)).not.toThrow()
  })

  it('re-striking a held pitch replaces the old voice', () => {
    engine.startMIDINote(60, 100, 'keys')
    const firstOsc = oscs()[0]!
    engine.startMIDINote(60, 100, 'keys')

    expect(firstOsc.stop).toHaveBeenCalled()
    expect(oscs()).toHaveLength(2)

    // Releasing the pitch releases only the new voice
    engine.stopMIDINote(60)
    expect(oscs()[1]!.stopped.length).toBeGreaterThan(0)
  })

  it('transport stop() leaves held MIDI notes sounding', () => {
    engine.play()
    engine.startMIDINote(60, 100, 'keys')
    const osc = oscs().find((o) => o.frequency.calls.length > 0)!

    engine.stop()
    expect(osc.stop).not.toHaveBeenCalled()
  })

  it('destroy() force-stops and disconnects all held voices', () => {
    engine.startMIDINote(60, 100, 'keys')
    engine.startMIDINote(64, 100, 'keys')
    const held = oscs()

    engine.destroy()
    for (const osc of held) {
      expect(osc.stop).toHaveBeenCalled()
      expect(osc.disconnect).toHaveBeenCalled()
    }
  })

  it('cleans up the voice graph after the release tail completes', () => {
    const nodesBefore = ctx.createdNodes.length
    engine.startMIDINote(60, 100, 'keys')
    const tempGain = ctx.createdNodes[nodesBefore]!
    expect(tempGain.kind).toBe('gain')

    engine.stopMIDINote(60)
    const releaseMs = normalizedToADSR(keysPreset.params.release, 'release') * 1000
    vi.advanceTimersByTime(releaseMs + 200)
    expect(tempGain.disconnect).toHaveBeenCalled()
  })

  it('does nothing before state has been provided', async () => {
    vi.stubGlobal('AudioContext', function (this: unknown) {
      ctx = createMockAudioContext()
      return ctx
    })
    const fresh = new AudioEngine()
    await fresh.initialize()
    const before = ctx.createdNodes.length
    fresh.startMIDINote(60, 100, 'keys')
    expect(ctx.createdNodes.length).toBe(before)
    fresh.destroy()
  })
})
