import { describe, it, expect, vi } from 'vitest'
import { AudioEngine } from '../AudioEngine'

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
