import { describe, it, expect, beforeEach } from 'vitest'
import { EffectsChain, RUNG_OUT, asksForNoEffect, delayTail } from '../EffectsChain'
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

    it('installs a 44101-point distortion curve with 2x oversampling', () => {
      chain.setParams(PARAMS)
      expect(distortion.curve).toHaveLength(44101)
      expect(distortion.oversample).toBe('2x')
    })

    it('uses a null (pass-through) curve at distortion 0 and a shaped curve above 0', () => {
      chain.setParams({ ...PARAMS, distortion: 0 })
      expect(distortion.curve).toBeNull()

      chain.setParams({ ...PARAMS, distortion: 0.5 })
      expect(distortion.curve).toHaveLength(44101)
    })

    it('keeps unity peak level across all distortion amounts (continuous at 0)', () => {
      // Normalized curve: curve(±1) = ±1 for every amount, and the curve
      // approaches the identity as the amount approaches 0 — no level jump
      // when the user first touches the knob.
      for (const amount of [0.001, 0.3, 1]) {
        chain.setParams({ ...PARAMS, distortion: amount })
        const curve = distortion.curve!
        expect(curve[44100]!).toBe(1)
        expect(curve[0]!).toBe(-1)
      }
      chain.setParams({ ...PARAMS, distortion: 0.001 })
      const nearIdentity = distortion.curve!
      expect(nearIdentity[33075]!).toBeCloseTo(0.5, 1) // x = 0.5 barely shaped (0.5078)
    })

    it('maps 0 in to exactly 0 out: the centre of the curve, as Web Audio reads it, is a point at 0', () => {
      // Web Audio reads a curve of n points at index (n - 1)(v + 1)/2, so an
      // input of 0 lands on a point only when n is odd, and must find 0 there
      for (const amount of [0.1, 0.6, 1]) {
        chain.setParams({ ...PARAMS, distortion: amount })
        const curve = distortion.curve as Float32Array
        expect(curve.length % 2).toBe(1)
        expect(curve[(curve.length - 1) / 2]).toBe(0)
      }
    })

    it('only rebuilds the distortion curve when the amount changes', () => {
      // setParams runs on every state sync (per dispatch, per track); the
      // 44101-point curve is rebuilt only when the distortion value moves
      chain.setParams(PARAMS)
      const first = distortion.curve
      chain.setParams(PARAMS)
      expect(distortion.curve).toBe(first)
      chain.setParams({ ...PARAMS, distortion: 0.9 })
      expect(distortion.curve).not.toBe(first)
    })
  })

  describe('oversampling with no distortion', () => {
    // WebKit oversamples a null curve, delaying the signal 6 samples at 2x;
    // Chromium and Firefox pass it through. Cue chains opt out of that.
    const waveshaperOf = (c: MockAudioContext) => c.createdNodes.find((n) => n.kind === 'waveshaper')!

    it('keeps 2x at distortion 0 by default, as track chains always have', () => {
      chain.setParams({ ...PARAMS, distortion: 0 })
      expect(distortion.curve).toBeNull()
      expect(distortion.oversample).toBe('2x')
    })

    it('leaves oversampling off at distortion 0 for a chain that asks, and on while distorting', () => {
      const cueCtx = createMockAudioContext()
      const cueChain = new EffectsChain(cueCtx as unknown as AudioContext, { oversampleOnlyWhenDistorting: true })
      const shaper = waveshaperOf(cueCtx)
      expect(shaper.curve).toBeNull()
      expect(shaper.oversample).toBe('none')
      cueChain.setParams({ ...PARAMS, distortion: 0.5 })
      expect(shaper.oversample).toBe('2x')
      cueChain.setParams({ ...PARAMS, distortion: 0 })
      expect(shaper.oversample).toBe('none')
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

describe('an EffectsChain built without reverb', () => {
  const NONE: EffectsParams = { delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, reverbMix: 0 }

  it('has no convolver, and still routes the dry path and the delay', () => {
    const ctx = createMockAudioContext()
    const chain = new EffectsChain(ctx as unknown as AudioContext, { reverb: false })
    const kinds = ctx.createdNodes.map((n) => n.kind)
    expect(kinds).not.toContain('convolver')
    expect(kinds.filter((k) => k === 'delay')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'waveshaper')).toHaveLength(1)
    chain.setParams({ ...NONE, delayTime: 0.3, delayMix: 0.5, distortion: 0.2 })
    chain.disconnect()
  })

  it('refuses a reverbMix above 0 rather than ignore it', () => {
    const ctx = createMockAudioContext()
    const chain = new EffectsChain(ctx as unknown as AudioContext, { reverb: false })
    expect(() => chain.setParams({ ...NONE, reverbMix: 0.1 })).toThrow(/reverb/)
  })

  it('is not what a chain gets by default, which tracks use', () => {
    const ctx = createMockAudioContext()
    new EffectsChain(ctx as unknown as AudioContext)
    expect(ctx.createdNodes.map((n) => n.kind)).toContain('convolver')
  })
})

describe('asksForNoEffect', () => {
  const NONE: EffectsParams = { delayTime: 0, delayFeedback: 0, delayMix: 0, distortion: 0, reverbMix: 0 }

  it('is true only when every value the chain carries is exactly 0', () => {
    expect(asksForNoEffect(NONE)).toBe(true)
    expect(asksForNoEffect({ ...NONE, delayMix: -0 })).toBe(true)
  })

  for (const key of Object.keys(NONE) as (keyof EffectsParams)[]) {
    it(`is false with ${key} above 0, however little: any value asks for its effect`, () => {
      expect(asksForNoEffect({ ...NONE, [key]: Number.MIN_VALUE })).toBe(false)
      expect(asksForNoEffect({ ...NONE, [key]: 1 })).toBe(false)
    })
  }
})

describe('delayTail', () => {
  const RATE = 48000
  const QUANTUM = 128 / RATE
  const ECHO: EffectsParams = { delayTime: 0.1, delayFeedback: 0.5, delayMix: 0.4, distortion: 0, reverbMix: 0 }
  /** A pass round the loop, as counted: the delay, a render quantum and a sample. */
  const pass = (delayTime: number) => Math.max(delayTime, QUANTUM) + QUANTUM + 1 / RATE
  const passes = (params: EffectsParams) => Math.round((delayTail(params, RATE) - QUANTUM) / pass(params.delayTime))

  it('waits 158 passes for the longest echo a cue can have, feedback 0.9 at a 1 s delay', () => {
    expect(0.9 ** 158).toBeLessThanOrEqual(RUNG_OUT)
    expect(0.9 ** 157).toBeGreaterThan(RUNG_OUT)
    expect(delayTail({ ...ECHO, delayTime: 1, delayFeedback: 1 }, RATE)).toBeCloseTo(158 * pass(1) + QUANTUM, 9)
  })

  it('waits the fewest passes that take the feedback to RUNG_OUT, at every feedback', () => {
    for (let i = 1; i <= 100; i++) {
      const params = { ...ECHO, delayFeedback: i / 100 }
      const n = passes(params)
      expect((params.delayFeedback * 0.9) ** n).toBeLessThanOrEqual(RUNG_OUT)
      if (n > 1) expect((params.delayFeedback * 0.9) ** (n - 1)).toBeGreaterThan(RUNG_OUT)
    }
  })

  it('waits one pass with no feedback, which empties the delay', () => {
    expect(passes({ ...ECHO, delayFeedback: 0 })).toBe(1)
  })

  it('counts a pass as no shorter than a render quantum, the least a delay in a cycle can be', () => {
    expect(delayTail({ ...ECHO, delayTime: 0, delayFeedback: 0 }, RATE)).toBeCloseTo(pass(0) + QUANTUM, 12)
    expect(pass(0)).toBeCloseTo(2 * QUANTUM + 1 / RATE, 12)
  })

  it('waits only for the oversampling when the delay is mixed in at 0', () => {
    expect(delayTail({ ...ECHO, delayMix: 0 }, RATE)).toBe(QUANTUM)
  })
})
