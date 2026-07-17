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
    it('wires distortion on the main path: input -> distortion -> dryGain -> output', () => {
      expect(isConnected(input, distortion)).toBe(true)
      expect(isConnected(distortion, dryGain)).toBe(true)
      expect(isConnected(dryGain, output)).toBe(true)
    })

    it('feeds the delay send from the distorted signal: distortion -> delay -> wetGain -> output', () => {
      expect(isConnected(distortion, delay)).toBe(true)
      expect(isConnected(delay, wetGain)).toBe(true)
      expect(isConnected(wetGain, output)).toBe(true)
      // the old wet-path-only wiring must be gone
      expect(isConnected(input, delay)).toBe(false)
      expect(isConnected(delay, distortion)).toBe(false)
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

    it('keeps unity peak level across all distortion amounts (continuous at 0)', () => {
      // Normalized curve: curve(±1) = ±1 for every amount, and the curve
      // approaches the identity as the amount approaches 0 — no level jump
      // when the user first touches the knob.
      for (const amount of [0.001, 0.3, 1]) {
        chain.setParams({ ...PARAMS, distortion: amount })
        const curve = distortion.curve!
        expect(curve[44099]!).toBeCloseTo(1, 2)
        expect(curve[0]!).toBeCloseTo(-1, 2)
      }
      chain.setParams({ ...PARAMS, distortion: 0.001 })
      const nearIdentity = distortion.curve!
      expect(nearIdentity[33075]!).toBeCloseTo(0.5, 1) // x = 0.5 barely shaped (0.5078)
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
