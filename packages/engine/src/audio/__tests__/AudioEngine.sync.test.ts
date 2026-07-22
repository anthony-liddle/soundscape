import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import { EffectsChain } from '../EffectsChain'
import { builtInPresets } from '../../presets'
import { createTrack } from '../../types'
import type { SoundscapeState } from '../../types'
import { normalizedToADSR } from '../../utils/time'
import { createMockAudioContext } from './mockWebAudio'
import type { MockAudioContext, MockNode } from './mockWebAudio'

type EngineInternals = {
  trackChannels: Map<string, { effectsChain: EffectsChain }>
}

const TRACK_ID = 'trk-1'

function makeState(paramOverrides?: Record<string, number>): SoundscapeState {
  const track = { ...createTrack('T', 'lead'), id: TRACK_ID }
  if (paramOverrides) track.paramOverrides = paramOverrides
  return {
    metadata: { name: 't', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
    tracks: [track],
    presets: builtInPresets,
    mixer: { tracks: { [TRACK_ID]: { volume: 0.8, mute: false, solo: false } }, masterVolume: 0.8 },
  }
}

describe('AudioEngine state sync', () => {
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

  describe('effects param diffing', () => {
    it('does not re-apply effects params when the effective values are unchanged', async () => {
      engine = new AudioEngine()
      await engine.initialize()
      const state = makeState()
      engine.updateState(state)

      const channel = (engine as unknown as EngineInternals).trackChannels.get(state.tracks[0]!.id)!
      const setParams = vi.spyOn(channel.effectsChain, 'setParams')

      // Same effective params — a typical unrelated dispatch (note added, etc.)
      engine.updateState(makeState())
      expect(setParams).not.toHaveBeenCalled()
    })

    it('re-applies effects params when an override changes them', async () => {
      engine = new AudioEngine()
      await engine.initialize()
      const state = makeState()
      engine.updateState(state)

      const channel = (engine as unknown as EngineInternals).trackChannels.get(state.tracks[0]!.id)!
      const setParams = vi.spyOn(channel.effectsChain, 'setParams')

      engine.updateState(makeState({ delayMix: 0.9 }))
      expect(setParams).toHaveBeenCalledOnce()
      expect(setParams.mock.calls[0]![0].delayMix).toBe(0.9)
    })
  })

  describe('previewNote cleanup', () => {
    it('keeps the preview voice alive for the full release tail before disconnecting', async () => {
      engine = new AudioEngine()
      await engine.initialize()
      engine.updateState(makeState())

      const nodesBefore = ctx.createdNodes.length
      // 'lead' preset release is 0.3 normalized
      const releaseSec = normalizedToADSR(0.3, 'release')
      engine.previewNote(60, 100, 'lead')
      const tempGain = ctx.createdNodes[nodesBefore] as MockNode
      expect(tempGain.kind).toBe('gain')

      // Old behavior disconnected at a fixed 500 + 1000 ms regardless of release
      vi.advanceTimersByTime(500 + 100)
      expect(tempGain.disconnect).not.toHaveBeenCalled()

      // After noteOff (500 ms) + release tail + margin, cleanup must have run
      vi.advanceTimersByTime(releaseSec * 1000 + 300)
      expect(tempGain.disconnect).toHaveBeenCalled()
    })
  })
})
