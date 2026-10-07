import { describe, expect, it } from 'vitest'
import type { CueDocument, CueInstrument } from '../../cues/types'
import { AudioEngine } from '../AudioEngine'
import { EffectsChain } from '../EffectsChain'
import { ORACLE_RATE, ORACLE_START_TIMES } from './oracleHarness'
import type { OfflineContextConstructor } from './oracleHarness'

/**
 * Distortion held to an oracle in a real browser: Chromium, Firefox and
 * WebKit, through vitest.browser.config.ts.
 *
 * The oracle is a plain WaveShaperNode built here, with no Soundscape code: a
 * curve of its own, centred where Web Audio reads it, and the 2x oversampling
 * a distorting chain uses. Its input is a cue's own note, rendered once with
 * no distortion, so the oracle, the cue path and the track path all shape
 * exactly the same signal, and only the shaping can differ. Each is rendered
 * offline in the same browser in the same run and compared sample by sample
 * from the first frame, so the silence before the note counts too: with zero
 * going in, zero must come out.
 *
 * TOLERANCE: 1e-6, about -120 dBFS, as the other browser tests. A curve read
 * half a point off puts out -(1 + 100 × distortion / π) / 44100 for an input
 * of 0, -4.6e-4 at a distortion of 0.6 (#110).
 */
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const TOLERANCE = 1e-6
const WHEN = ORACLE_START_TIMES[0]!
const SECONDS = 0.6
const LENGTH = Math.round(SECONDS * ORACLE_RATE)
/** Points in the oracle's curve, as many as the chain's. */
const POINTS = 44101

/**
 * The soft clip a distorting chain applies, x·(π + k)/(π + k·|x|) for
 * k = 100 × distortion, at the points where Web Audio reads a curve: for n
 * points, an input v is read at index (n - 1)(v + 1)/2. With n odd, an input
 * of exactly 0 is read at the centre point, which holds exactly 0.
 */
function centredCurve(distortion: number): Float32Array<ArrayBuffer> {
  const centre = (POINTS - 1) / 2
  const k = distortion * 100
  const curve = new Float32Array(POINTS)
  for (let i = 0; i < POINTS; i++) {
    const x = (i - centre) / centre
    curve[i] = (x * (Math.PI + k)) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

/** A sawtooth that rings past the end of the render, at its sustain, so no voice stops mid-comparison. */
const instrument = (distortion: number): CueInstrument => ({
  waveform: 'sawtooth',
  pitchOffset: 0,
  attack: 0.074,
  decay: 0.2,
  sustain: 0.5,
  release: 0,
  envelopeCurve: 'exponential',
  envelopeFloor: 1e-4,
  filterType: 'none',
  filterCutoff: 1,
  filterResonance: 0,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion,
  reverbMix: 0,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  unisonDetune: 0,
  velocityResponse: 0,
})

const documentAt = (distortion: number): CueDocument => ({
  format: 'soundscape-cues',
  version: 1,
  instruments: { grit: instrument(distortion) },
  cues: { grit: { notes: [{ id: 'grit-1', instrument: 'grit', start: 0, duration: 0.5, pitch: 45, level: 0.4 }] } },
})

async function renderCue(distortion: number, play: boolean): Promise<Float32Array<ArrayBuffer>> {
  const context = new Offline(1, LENGTH, ORACLE_RATE)
  const engine = new AudioEngine({ context })
  await engine.initialize()
  engine.loadCues(documentAt(distortion))
  if (play) engine.playCue('grit', WHEN)
  // Copied at once: a renderer may reuse the buffer's memory once it is collected
  const samples = Float32Array.from((await context.startRendering()).getChannelData(0))
  engine.destroy()
  return samples
}

/** Play `input` from the first frame into whatever `into` builds, and render. */
async function renderThrough(
  input: Float32Array<ArrayBuffer>,
  into: (context: BaseAudioContext) => AudioNode
): Promise<Float32Array<ArrayBuffer>> {
  const context = new Offline(1, LENGTH, ORACLE_RATE)
  const buffer = context.createBuffer(1, input.length, ORACLE_RATE)
  buffer.copyToChannel(input, 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(into(context))
  source.start(0)
  return Float32Array.from((await context.startRendering()).getChannelData(0))
}

/** The oracle: a plain WaveShaperNode with the centred curve, oversampled 2x. */
function oracle(distortion: number) {
  return (context: BaseAudioContext): AudioNode => {
    const shaper = context.createWaveShaper()
    shaper.curve = centredCurve(distortion)
    shaper.oversample = '2x'
    shaper.connect(context.destination)
    return shaper
  }
}

/** The chain a track gets, as ensureTrackChannel builds it, with only distortion. */
function trackChain(distortion: number) {
  return (context: BaseAudioContext): AudioNode => {
    const chain = new EffectsChain(context)
    chain.setParams({ delayTime: 0, delayFeedback: 0, delayMix: 0, distortion, reverbMix: 0 })
    chain.getOutput().connect(context.destination)
    return chain.getInput()
  }
}

/**
 * The largest sample difference, where it falls, and the mean difference
 * over the second half of the silence before the note, where only an offset
 * can show. The first half holds the oversampler settling from the first
 * frame, about 1.4 ms.
 */
function compare(a: Float32Array, b: Float32Array) {
  let largest = 0
  let at = 0
  let offset = 0
  const note = Math.round(WHEN * ORACLE_RATE)
  const settled = Math.round(note / 2)
  for (let i = 0; i < LENGTH; i++) {
    const d = a[i]! - b[i]!
    if (Math.abs(d) > largest) {
      largest = Math.abs(d)
      at = i / ORACLE_RATE
    }
    if (i >= settled && i < note) offset += d / (note - settled)
  }
  return {
    largest,
    report: `largest difference ${largest.toExponential(4)} at ${at.toFixed(5)} s; mean difference over the silence before the note ${offset.toExponential(4)}`,
  }
}

const peak = (x: Float32Array) => x.reduce((p, v) => Math.max(p, Math.abs(v)), 0)

describe('distortion against a plain WaveShaperNode, in this browser', () => {
  it('names the browser', () => {
    console.log(navigator.userAgent)
  })

  for (const distortion of [0.1, 0.6, 1]) {
    describe(`at ${distortion}`, () => {
      it('the cue path and the track path both match the oracle', async () => {
        const input = await renderCue(0, true)
        const expected = await renderThrough(input, oracle(distortion))
        // The distortion is in what they are held to: the oracle reshapes the note
        expect(peak(input)).toBeGreaterThan(0.1)
        expect(compare(expected, input).largest).toBeGreaterThan(0.01)

        const cue = compare(await renderCue(distortion, true), expected)
        const track = compare(await renderThrough(input, trackChain(distortion)), expected)
        expect.soft(cue.largest, `cue path: ${cue.report}`).toBeLessThan(TOLERANCE)
        expect.soft(track.largest, `track path: ${track.report}`).toBeLessThan(TOLERANCE)
      })

      it('with a distortion instrument loaded and nothing playing, cue output is exactly 0', async () => {
        const samples = await renderCue(distortion, false)
        const first = samples.findIndex((v) => v !== 0)
        expect(first, `sample ${first} is ${samples[first]}`).toBe(-1)
      })
    })
  }
})
