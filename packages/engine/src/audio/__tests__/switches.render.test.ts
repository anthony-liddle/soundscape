import { describe, expect, it } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { AudioEngine } from '../AudioEngine'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'
import { normalizedToADSR } from '../../utils/time'
import { midiToFrequency } from '../../utils/pitch'
import { SAMPLE_RATE, START, largestDifference } from './renderHarness'
import { createMockAudioContext, isConnected } from './mockWebAudio'

/**
 * The 0.4.0 switches on a voice, rendered in node-web-audio-api: an
 * exponential envelope with a floor, and a filter type of 'none'.
 *
 * Each is checked against a graph built by hand with the same Web Audio calls
 * a game would make, so "reproduces a hand-written exponential envelope" is a
 * measured claim, not an assumed one.
 */
const ATTACK = Math.sqrt((0.012 - 0.001) / 1.999) // 12 ms
const DECAY = Math.sqrt((0.018 - 0.01) / 2.99) // 18 ms
const FLOOR = 1e-4

const tick = (overrides: Partial<InstrumentParams> = {}): InstrumentParams => ({
  ...defaultInstrumentParams,
  waveform: 'square',
  attack: ATTACK,
  decay: DECAY,
  sustain: 0,
  release: 0,
  velocityResponse: 0,
  filterType: 'none',
  envelopeCurve: 'exponential',
  envelopeFloor: FLOOR,
  ...overrides,
})

async function renderVoice(
  params: InstrumentParams,
  offAfter: number,
  prepare: (voice: VoiceSynthesizer) => void = () => {}
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round(0.5 * SAMPLE_RATE), SAMPLE_RATE)
  const voice = new VoiceSynthesizer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode)
  prepare(voice)
  voice.noteOn({ pitch: 81, velocity: 127, instrument: params }, START)
  voice.noteOff(params, START + offAfter)
  const buffer = await ctx.startRendering()
  voice.stop()
  return Float32Array.from(buffer.getChannelData(0))
}

/**
 * The same note built by hand: an oscillator into a gain carrying the envelope,
 * straight to the destination, released at `offAfter`.
 */
async function renderByHand(curve: 'linear' | 'exponential', offAfter: number, waveform: OscillatorType = 'square') {
  const ctx = new OfflineAudioContext(1, Math.round(0.5 * SAMPLE_RATE), SAMPLE_RATE)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = waveform
  osc.frequency.setValueAtTime(midiToFrequency(81), START)
  const attack = normalizedToADSR(ATTACK, 'attack')
  const decay = normalizedToADSR(DECAY, 'decay')
  const release = normalizedToADSR(0, 'release')
  const g = gain.gain
  g.cancelScheduledValues(START)
  if (curve === 'exponential') {
    g.setValueAtTime(FLOOR, START)
    g.exponentialRampToValueAtTime(0.3, START + attack)
    g.exponentialRampToValueAtTime(FLOOR, START + attack + decay)
    g.cancelAndHoldAtTime(START + offAfter)
    g.exponentialRampToValueAtTime(FLOOR, START + offAfter + release)
  } else {
    g.setValueAtTime(0, START)
    g.linearRampToValueAtTime(0.3, START + attack)
    g.linearRampToValueAtTime(0, START + attack + decay)
    g.cancelAndHoldAtTime(START + offAfter)
    g.linearRampToValueAtTime(0, START + offAfter + release)
  }
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(START)
  osc.stop(START + offAfter + release + 0.01)
  return Float32Array.from((await ctx.startRendering()).getChannelData(0))
}

const peakIn = (x: Float32Array, from: number, to: number) => {
  let p = 0
  for (let i = Math.round(from * SAMPLE_RATE); i < Math.round(to * SAMPLE_RATE); i++) p = Math.max(p, Math.abs(x[i]!))
  return p
}

describe('the exponential envelope', () => {
  it('matches the same envelope written by hand, sample for sample', async () => {
    const voice = await renderVoice(tick(), 0.03)
    const hand = await renderByHand('exponential', 0.03)
    expect(peakIn(voice, START, START + 0.05)).toBeGreaterThan(0.1)
    expect(largestDifference(voice, hand)).toBe(0)
  })

  it('releases mid-decay from the level the envelope had reached, with no jump', async () => {
    const voice = await renderVoice(tick({ release: 0.1 }), 0.02)
    // Envelope just before and just after the release starts at 20 ms
    const before = peakIn(voice, START + 0.0185, START + 0.02)
    const after = peakIn(voice, START + 0.02, START + 0.0215)
    expect(after / before).toBeGreaterThan(0.5)
    expect(after / before).toBeLessThan(1)
    // and it falls to the floor rather than stopping dead
    expect(peakIn(voice, START + 0.05, START + 0.06)).toBeGreaterThan(0)
  })

  it('releases identically where cancelAndHoldAtTime is missing', async () => {
    // Firefox's fallback reads gain.value, which before rendering returns the
    // param's default of 1, not the envelope. The exponential path computes
    // the held level instead, so the two renders agree.
    const params = tick({ release: 0.1 })
    const held = await renderVoice(params, 0.02)
    const fallback = await renderVoice(params, 0.02, (voice) => {
      const gain = (voice as unknown as { gainNode: GainNode }).gainNode.gain
      Object.defineProperty(gain, 'cancelAndHoldAtTime', { value: undefined })
    })
    expect(largestDifference(fallback, held)).toBeLessThan(1e-6)
  })

  it('needs its floor: a voice given an exponential curve without one says so', () => {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode)
    const params = tick()
    delete params.envelopeFloor
    expect(() => voice.noteOn({ pitch: 81, velocity: 127, instrument: params }, 0)).toThrow(/envelopeFloor/)
  })
})

describe("filterType 'none'", () => {
  it('takes the filter out of the path: the voice matches a graph with no filter', async () => {
    const linear = tick({ envelopeCurve: 'linear' })
    delete linear.envelopeFloor
    const voice = await renderVoice(linear, 0.03)
    const hand = await renderByHand('linear', 0.03)
    expect(largestDifference(voice, hand)).toBe(0)
  })

  it('is not the same as the most open lowpass', async () => {
    const none = await renderVoice(tick(), 0.03)
    const open = await renderVoice(tick({ filterType: 'lowpass', filterCutoff: 1, filterResonance: 0 }), 0.03)
    expect(largestDifference(none, open)).toBeGreaterThan(1e-3)
  })

  it('rewires a pooled voice both ways, and leaves one that never sees it alone', () => {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode)
    const nodes = voice as unknown as { gainNode: never; filterNode: never; output: never }
    const plain = { ...defaultInstrumentParams }
    voice.noteOn({ pitch: 60, velocity: 100, instrument: plain }, 0)
    expect((nodes.gainNode as { disconnect: { mock: { calls: unknown[] } } }).disconnect.mock.calls).toHaveLength(0)
    voice.noteOn({ pitch: 60, velocity: 100, instrument: { ...plain, filterType: 'none' } }, 0)
    expect(isConnected(nodes.gainNode, nodes.output)).toBe(true)
    voice.noteOn({ pitch: 60, velocity: 100, instrument: plain }, 0)
    const disconnects = (nodes.gainNode as { disconnect: { mock: { calls: unknown[][] } } }).disconnect.mock.calls
    expect(disconnects.map((c) => c[0])).toEqual([nodes.filterNode, nodes.output])
  })
})

describe('AudioEngine given an offline context', () => {
  it('initializes, keeps its analyser, and neither resumes nor closes what it was given', async () => {
    const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    // node-web-audio-api refuses the inlined worklet module, so the engine
    // falls back to its timer scheduler; initialize still resolves.
    await engine.initialize()
    expect(engine.getAnalyserNode()).not.toBeNull()
    await expect(engine.resume()).resolves.toBeUndefined()
    engine.destroy()
    expect(ctx.state).toBe('suspended')
  })
})
