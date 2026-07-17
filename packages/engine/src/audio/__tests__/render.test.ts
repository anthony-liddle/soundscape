import { describe, it, expect } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { EffectsChain } from '../EffectsChain'
import type { EffectsParams } from '../EffectsChain'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'

/**
 * Real-DSP render tests: the synthesis classes run against an actual Web Audio
 * implementation (node-web-audio-api) rendering into an OfflineAudioContext,
 * and assertions are made on the rendered samples. This is the only test
 * style that catches "schedules fine but produces silence" regressions.
 *
 * Tests marked [characterizes-bug] pin CURRENT buggy audio on purpose — flip
 * them in the same commit as the 0.3.0 fix.
 */

const SAMPLE_RATE = 44100

function rms(data: Float32Array, from = 0, to = data.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += data[i]! * data[i]!
  return Math.sqrt(sum / (to - from))
}

function windowRms(data: Float32Array, fromSec: number, toSec: number): number {
  return rms(data, Math.floor(fromSec * SAMPLE_RATE), Math.floor(toSec * SAMPLE_RATE))
}

function makeParams(overrides: Partial<InstrumentParams> = {}): InstrumentParams {
  return { ...defaultInstrumentParams, ...overrides }
}

async function renderVoice(
  params: InstrumentParams,
  { pitch = 69, velocity = 127, noteOffAt = null as number | null, duration = 0.5 } = {}
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.floor(duration * SAMPLE_RATE), SAMPLE_RATE)
  const voice = new VoiceSynthesizer(
    ctx as unknown as AudioContext,
    ctx.destination as unknown as AudioNode
  )
  voice.noteOn({ pitch, velocity, instrument: params }, 0)
  if (noteOffAt !== null) voice.noteOff(params, noteOffAt)
  const buffer = await ctx.startRendering()
  voice.stop() // clear the pending release-cleanup timer
  return buffer.getChannelData(0)
}

// The source starts at 0.05 s, NOT 0, and every measurement skips the first
// 20 ms: node-web-audio-api's first render quanta are nondeterministic —
// param events scheduled at t=0 can settle late, and the very first samples
// occasionally contain uninitialized garbage (observed values ~1e+31 in
// samples 2–5 of an otherwise-correct render). Both flake modes are confined
// to the pre-signal region, so tests measure from MEASURE_FROM onward.
const SOURCE_START = 0.05
const SOURCE_STOP = 0.15
const MEASURE_FROM = 0.02

async function renderThroughChain(
  effects: EffectsParams,
  { duration = 1 } = {}
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.floor(duration * SAMPLE_RATE), SAMPLE_RATE)
  const chain = new EffectsChain(ctx as unknown as AudioContext)
  chain.setParams(effects)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 440
  osc.connect(chain.getInput() as unknown as AudioNode)
  chain.getOutput().connect(ctx.destination as unknown as AudioNode)
  osc.start(SOURCE_START)
  osc.stop(SOURCE_STOP)

  const buffer = await ctx.startRendering()
  return buffer.getChannelData(0)
}

const DRY_ONLY: EffectsParams = {
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  reverbMix: 0,
}

describe('VoiceSynthesizer rendering', () => {
  it('produces audible output at the requested frequency', async () => {
    const data = await renderVoice(makeParams({ waveform: 'sine', attack: 0, lfoDepth: 0 }))

    // Sustained region should carry energy
    expect(windowRms(data, 0.1, 0.4)).toBeGreaterThan(0.02)

    // A 440 Hz sine crosses zero ~880 times/sec; count in a 0.25 s window
    let crossings = 0
    const from = Math.floor(0.1 * SAMPLE_RATE)
    const to = Math.floor(0.35 * SAMPLE_RATE)
    for (let i = from + 1; i < to; i++) {
      if ((data[i - 1]! < 0 && data[i]! >= 0) || (data[i - 1]! > 0 && data[i]! <= 0)) crossings++
    }
    expect(crossings).toBeGreaterThan(200)
    expect(crossings).toBeLessThan(240)
  })

  it('is silent for velocity 0 with full velocity response', async () => {
    const data = await renderVoice(makeParams({ waveform: 'sine', velocityResponse: 1 }), {
      velocity: 0,
    })
    expect(windowRms(data, MEASURE_FROM, 0.5)).toBeLessThan(1e-4)
  })

  it('decays to silence after noteOff plus the release tail', async () => {
    // release 0.1 normalized ≈ 60 ms; noteOff at 0.2 s → silent well before 0.6 s
    const data = await renderVoice(
      makeParams({ waveform: 'sine', release: 0.1, lfoDepth: 0 }),
      { noteOffAt: 0.2, duration: 1 }
    )
    expect(windowRms(data, 0.05, 0.15)).toBeGreaterThan(0.02) // audible before
    expect(windowRms(data, 0.8, 1.0)).toBeLessThan(1e-4) // silent after
  })
})

describe('EffectsChain rendering', () => {
  it('passes the dry signal through with unity-ish gain when all effects are off', async () => {
    const data = await renderThroughChain(DRY_ONLY)
    expect(windowRms(data, 0.06, 0.14)).toBeGreaterThan(0.3)
    expect(windowRms(data, 0.5, 1.0)).toBeLessThan(1e-4) // no tail
  })

  it('[characterizes-bug H6] distortion is INAUDIBLE when delayMix is 0', async () => {
    // Distortion sits inside the delay wet path, so with the delay mix at 0
    // the rendered output with heavy distortion is byte-identical to a clean
    // render. This is the review's H6 bug; 0.3.0 re-routes distortion onto
    // the main path, after which these buffers MUST differ — flip this test.
    const clean = await renderThroughChain({ ...DRY_ONLY, distortion: 0 })
    const distorted = await renderThroughChain({ ...DRY_ONLY, distortion: 0.8 })

    let maxDiff = 0
    let firstDiffIndex = -1
    for (let i = Math.floor(MEASURE_FROM * SAMPLE_RATE); i < clean.length; i++) {
      const d = Math.abs(clean[i]! - distorted[i]!)
      if (d > 1e-6 && firstDiffIndex === -1) firstDiffIndex = i
      maxDiff = Math.max(maxDiff, d)
    }
    // Diagnostics printed only on failure, for platform-specific debugging
    if (maxDiff >= 1e-6) {
      const at = firstDiffIndex
      console.log('[H6-diag] firstDiffIndex:', at, `(${(at / SAMPLE_RATE).toFixed(4)}s)`)
      console.log('[H6-diag] clean around:', Array.from(clean.slice(at - 2, at + 4)))
      console.log('[H6-diag] distorted around:', Array.from(distorted.slice(at - 2, at + 4)))
      console.log('[H6-diag] clean rms 0-0.1:', windowRms(clean, 0, 0.1), 'post-stop 0.5-1:', windowRms(clean, 0.5, 1))
      console.log('[H6-diag] dist  rms 0-0.1:', windowRms(distorted, 0, 0.1), 'post-stop 0.5-1:', windowRms(distorted, 0.5, 1))
    }
    expect(maxDiff).toBeLessThan(1e-6)
  })

  it('distortion IS audible when routed through an open delay mix', async () => {
    // Control for the test above: with delayMix > 0 the wet path is live and
    // distortion changes the output
    const base: EffectsParams = { ...DRY_ONLY, delayTime: 0.3, delayMix: 0.5 }
    const clean = await renderThroughChain(base)
    const distorted = await renderThroughChain({ ...base, distortion: 0.8 })

    let maxDiff = 0
    for (let i = Math.floor(MEASURE_FROM * SAMPLE_RATE); i < clean.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(clean[i]! - distorted[i]!))
    }
    expect(maxDiff).toBeGreaterThan(0.01)
  })

  it('produces an audible echo tail when delayMix > 0', async () => {
    // Source plays 0.05–0.15 s; delayTime 0.3 s → echo lands at 0.35–0.45 s
    const withDelay = await renderThroughChain({
      ...DRY_ONLY,
      delayTime: 0.3,
      delayFeedback: 0.3,
      delayMix: 0.5,
    })
    const withoutDelay = await renderThroughChain(DRY_ONLY)

    expect(windowRms(withDelay, 0.36, 0.44)).toBeGreaterThan(0.05)
    expect(windowRms(withoutDelay, 0.36, 0.44)).toBeLessThan(1e-4)
  })

  it('produces a reverb tail when reverbMix > 0', async () => {
    const withReverb = await renderThroughChain({ ...DRY_ONLY, reverbMix: 0.6 })
    const withoutReverb = await renderThroughChain(DRY_ONLY)

    expect(windowRms(withReverb, 0.2, 0.5)).toBeGreaterThan(0.005)
    expect(windowRms(withoutReverb, 0.25, 0.5)).toBeLessThan(1e-4)
  })
})
