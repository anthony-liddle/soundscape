import { describe, it, expect, beforeEach } from 'vitest'
import { EffectsChain } from '../EffectsChain'
import type { EffectsParams } from '../EffectsChain'
import { createMockAudioContext, isConnected } from './mockWebAudio'
import type { MockAudioContext, MockNode } from './mockWebAudio'

/**
 * Characterization tests pinning the CURRENT effects routing and parameter
 * mapping. Tests marked [characterizes-bug] assert known-buggy behavior on
 * purpose — flip them in the same commit as the 0.3.0 fix.
 */

const PARAMS: EffectsParams = {
  delayTime: 0.5,
  delayFeedback: 0.5,
  delayMix: 0.4,
  distortion: 0.3,
  reverbMix: 0.2,
}

describe('EffectsChain', () => {
  let ctx: MockAudioContext
  let chain: EffectsChain

  // Constructor creates, in order:
  // input, output, dryGain, wetGain, delay, feedback, distortion, convolver, reverbWet
  let input: MockNode
  let output: MockNode
  let dryGain: MockNode
  let wetGain: MockNode
  let delay: MockNode
  let feedback: MockNode
  let distortion: MockNode
  let convolver: MockNode
  let reverbWet: MockNode

  beforeEach(() => {
    ctx = createMockAudioContext()
    chain = new EffectsChain(ctx as unknown as AudioContext)
    ;[input, output, dryGain, wetGain, delay, feedback, distortion, convolver, reverbWet] =
      ctx.createdNodes as [
        MockNode, MockNode, MockNode, MockNode, MockNode, MockNode, MockNode, MockNode, MockNode,
      ]
  })

  describe('routing', () => {
    it('wires the dry path input -> dryGain -> output', () => {
      expect(isConnected(input, dryGain)).toBe(true)
      expect(isConnected(dryGain, output)).toBe(true)
    })

    it('wires the delay wet path input -> delay -> distortion -> wetGain -> output', () => {
      expect(isConnected(input, delay)).toBe(true)
      expect(isConnected(delay, distortion)).toBe(true)
      expect(isConnected(distortion, wetGain)).toBe(true)
      expect(isConnected(wetGain, output)).toBe(true)
    })

    it('[characterizes-bug H6] places distortion ONLY inside the delay wet path', () => {
      // Distortion is presented in the UI as an independent effect, but it is
      // wired downstream of the delay send: with delayMix = 0 the wet gain is
      // 0 and distortion is inaudible. 0.3.0 moves distortion onto the main
      // path — this test must be rewritten then.
      expect(isConnected(input, distortion)).toBe(false)
      expect(isConnected(dryGain, distortion)).toBe(false)
    })

    it('wires the feedback loop delay -> feedbackGain -> delay', () => {
      expect(isConnected(delay, feedback)).toBe(true)
      expect(isConnected(feedback, delay)).toBe(true)
    })

    it('wires the reverb send input -> convolver -> reverbWetGain -> output', () => {
      expect(isConnected(input, convolver)).toBe(true)
      expect(isConnected(convolver, reverbWet)).toBe(true)
      expect(isConnected(reverbWet, output)).toBe(true)
    })

    it('exposes input and output nodes', () => {
      expect(chain.getInput()).toBe(input)
      expect(chain.getOutput()).toBe(output)
    })
  })

  describe('reverb impulse response', () => {
    it('installs a stereo IR of 2.5 seconds at the context sample rate', () => {
      const buffer = convolver.buffer as { numberOfChannels: number; length: number }
      expect(buffer.numberOfChannels).toBe(2)
      expect(buffer.length).toBe(Math.floor(2.5 * ctx.sampleRate))
    })
  })

  describe('setParams', () => {
    it('maps delay time, caps feedback at 0.9x, and sets complementary dry/wet gains', () => {
      chain.setParams(PARAMS)
      expect(delay.delayTime.value).toBe(0.5)
      expect(feedback.gain.value).toBeCloseTo(0.5 * 0.9)
      expect(dryGain.gain.value).toBeCloseTo(1 - 0.4)
      expect(wetGain.gain.value).toBeCloseTo(0.4)
      expect(reverbWet.gain.value).toBeCloseTo(0.2)
    })

    it('installs a 44100-sample distortion curve with 2x oversampling', () => {
      chain.setParams(PARAMS)
      expect(distortion.curve).toHaveLength(44100)
      expect(distortion.oversample).toBe('2x')
    })

    it('uses a null (pass-through) curve at distortion 0 and a shaped curve above 0', () => {
      chain.setParams({ ...PARAMS, distortion: 0 })
      expect(distortion.curve).toBeNull()

      chain.setParams({ ...PARAMS, distortion: 0.5 })
      expect(distortion.curve).toHaveLength(44100)
    })

    it('[characterizes-quirk L5] drops output level sharply between distortion 0 and a tiny positive amount', () => {
      // curve(x) = ((3+k)·x·20·(π/180)) / (π + k·|x|); at k→0+ the peak is
      // ≈ 0.33 versus 1.0 for the k = 0 identity — a ~3x jump when the user
      // first touches the knob.
      chain.setParams({ ...PARAMS, distortion: 0.001 })
      const nearZero = distortion.curve!
      expect(Math.abs(nearZero[44099]!)).toBeLessThan(0.4)
    })

    it('only rebuilds the distortion curve when the amount changes', () => {
      // setParams runs on every state sync (per dispatch, per track); the
      // 44100-sample curve is rebuilt only when the distortion value moves
      chain.setParams(PARAMS)
      const first = distortion.curve
      chain.setParams(PARAMS)
      expect(distortion.curve).toBe(first)
      chain.setParams({ ...PARAMS, distortion: 0.9 })
      expect(distortion.curve).not.toBe(first)
    })
  })

  describe('disconnect', () => {
    it('disconnects every node in the chain', () => {
      chain.disconnect()
      for (const node of [input, output, dryGain, wetGain, delay, feedback, distortion, convolver, reverbWet]) {
        expect(node.disconnect).toHaveBeenCalled()
      }
    })
  })
})
