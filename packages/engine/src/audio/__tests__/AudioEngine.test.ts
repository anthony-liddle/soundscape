import { describe, it, expect, vi, afterEach } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import { builtInPresets } from '../../presets'
import type { SoundscapeState } from '../../types'
import { createMockAudioContext } from './mockWebAudio'

// emitBeatUpdate is private — cast to any to access it directly.
// This lets us test the subscription contract without needing a full AudioContext mock.
type EngineInternal = {
  emitBeatUpdate: (beat: number) => void
  beatUpdateListeners: Set<(beat: number) => void>
}

describe('AudioEngine', () => {
  describe('getAnalyserNode', () => {
    it('returns null before initialize', () => {
      const engine = new AudioEngine()
      expect(engine.getAnalyserNode()).toBeNull()
    })
  })

  describe('onBeatUpdate', () => {
    it('returns an unsubscribe function', () => {
      const engine = new AudioEngine()
      const unsub = engine.onBeatUpdate(() => {})
      expect(typeof unsub).toBe('function')
    })

    it('delivers updates to all subscribers', () => {
      const engine = new AudioEngine()
      const cb1 = vi.fn()
      const cb2 = vi.fn()

      engine.onBeatUpdate(cb1)
      engine.onBeatUpdate(cb2)
      ;(engine as unknown as EngineInternal).emitBeatUpdate(8)

      expect(cb1).toHaveBeenCalledOnce()
      expect(cb1).toHaveBeenCalledWith(8)
      expect(cb2).toHaveBeenCalledOnce()
      expect(cb2).toHaveBeenCalledWith(8)
    })

    it('unsubscribe removes only the targeted listener', () => {
      const engine = new AudioEngine()
      const cb1 = vi.fn()
      const cb2 = vi.fn()

      const unsub1 = engine.onBeatUpdate(cb1)
      engine.onBeatUpdate(cb2)
      unsub1()
      ;(engine as unknown as EngineInternal).emitBeatUpdate(4)

      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledWith(4)
    })

    it('calling unsubscribe twice is safe', () => {
      const engine = new AudioEngine()
      const cb = vi.fn()
      const unsub = engine.onBeatUpdate(cb)

      expect(() => {
        unsub()
        unsub()
      }).not.toThrow()
    })

    it('destroy clears all listeners', () => {
      const engine = new AudioEngine()
      const cb = vi.fn()
      engine.onBeatUpdate(cb)

      engine.destroy()
      ;(engine as unknown as EngineInternal).emitBeatUpdate(1)

      expect(cb).not.toHaveBeenCalled()
    })
  })
})

describe('AudioEngine context lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('creates, resumes and closes its own AudioContext when given none, as before 0.4.0', async () => {
    vi.useFakeTimers()
    const ctx = createMockAudioContext()
    ctx.state = 'suspended'
    const resume = vi.spyOn(ctx, 'resume')
    const close = vi.spyOn(ctx, 'close')
    const created = vi.fn(function () {
      return ctx
    })
    vi.stubGlobal('AudioContext', created)

    const engine = new AudioEngine()
    await engine.initialize()
    await engine.resume()
    engine.destroy()

    expect(created).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('uses a context it is given, and leaves it open', async () => {
    vi.useFakeTimers()
    const ctx = createMockAudioContext()
    const close = vi.spyOn(ctx, 'close')
    const created = vi.fn()
    vi.stubGlobal('AudioContext', created)

    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    engine.destroy()

    expect(created).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })
})

describe("a track's effects chain", () => {
  // WebKit oversamples a waveshaper with no curve, delaying the signal 6
  // samples at 2x and filtering it, where Chromium and Firefox pass it
  // through. A track with no distortion is not oversampled, as a cue is not.
  const stateWith = (distortion: number): SoundscapeState => ({
    metadata: { name: 'Track', tempo: 120, timeSignature: [4, 4], lengthBeats: 4 },
    presets: [...builtInPresets],
    tracks: [{ id: 'pad', name: 'Pad', presetId: 'pad', notes: [], paramOverrides: { distortion } }],
    mixer: { tracks: { pad: { volume: 1, mute: false, solo: false } }, masterVolume: 1 },
  })

  it('leaves the waveshaper unoversampled with no distortion, and oversamples it while distorting', async () => {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    engine.updateState(stateWith(0))
    const shaper = ctx.createdNodes.find((n) => n.kind === 'waveshaper')!
    expect(shaper.curve).toBeNull()
    expect(shaper.oversample).toBe('none')
    engine.updateState(stateWith(0.3))
    expect(shaper.oversample).toBe('2x')
    engine.updateState(stateWith(0))
    expect(shaper.oversample).toBe('none')
  })
})
