import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'
import type { OfflineContextConstructor } from './oracleHarness'

/**
 * A music-path voice, noteOn then noteOff, released at chosen moments around
 * the end of its decay, and the same envelope written by hand in plain Web
 * Audio, with no Soundscape code, to hold it to. Runs in node-web-audio-api
 * and in a real browser alike.
 */
export const RELEASE_RATE = 48000

export interface ReleaseShape {
  curve: 'linear' | 'exponential'
  /** Seconds. */
  attack: number
  decay: number
  release: number
  /** The sustain level as a fraction of the peak. */
  sustain: number
  /** The exponential floor; 0 for linear. */
  floor: number
}

/** The voice's peak at velocity 127 with no velocity response. */
export const RELEASE_PEAK = 0.3

export const RELEASE_SHAPES: Record<string, ReleaseShape> = {
  'an exponential decay to the floor, like a Peach note': {
    curve: 'exponential', attack: 0.012, decay: 0.268, release: 0.01, sustain: 0, floor: 1e-4,
  },
  'an exponential envelope holding a sustain level': {
    curve: 'exponential', attack: 0.012, decay: 0.05, release: 0.1, sustain: 0.4, floor: 1e-4,
  },
  'a linear envelope holding a sustain level': {
    curve: 'linear', attack: 0.02, decay: 0.08, release: 0.2, sustain: 0.5, floor: 0,
  },
}

// The engine's normalized ADSR mapping, inverted and applied as it applies it
const attackOf = (n: number) => 0.001 + n * n * 1.999
const decayOf = (n: number) => 0.01 + n * n * 2.99
const releaseOf = (n: number) => 0.01 + n * n * 4.99

function normalized(shape: ReleaseShape) {
  return {
    attack: Math.sqrt((shape.attack - 0.001) / 1.999),
    decay: Math.sqrt((shape.decay - 0.01) / 2.99),
    release: Math.sqrt((shape.release - 0.01) / 4.99),
  }
}

export function instrumentFor(shape: ReleaseShape): InstrumentParams {
  const n = normalized(shape)
  return {
    ...defaultInstrumentParams,
    waveform: 'sine',
    attack: n.attack,
    decay: n.decay,
    release: n.release,
    sustain: shape.sustain,
    filterType: 'none',
    velocityResponse: 0,
    lfoDepth: 0,
    ...(shape.curve === 'exponential' ? { envelopeCurve: 'exponential', envelopeFloor: shape.floor } : {}),
  }
}

/** Where the voice puts the end of its decay for a note starting at `start`, to the bit. */
export function decayEndOf(shape: ReleaseShape, start: number): number {
  const n = normalized(shape)
  return start + attackOf(n.attack) + decayOf(n.decay)
}

/** One double further along. */
export function nextUp(x: number): number {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, x)
  view.setBigUint64(0, view.getBigUint64(0) + (x >= 0 ? 1n : -1n))
  return view.getFloat64(0)
}

/** The span a release render covers. */
const lengthFor = (releaseTime: number, shape: ReleaseShape) =>
  Math.ceil((releaseTime + shape.release + 0.05) * RELEASE_RATE)

/**
 * The voice, released at `releaseTime`. With `withoutHold`, its gain param has
 * no cancelAndHoldAtTime, as in Firefox, so the release takes the fallback in
 * any renderer.
 */
export async function renderVoiceRelease(
  Offline: OfflineContextConstructor,
  shape: ReleaseShape,
  start: number,
  releaseTime: number,
  withoutHold: boolean
): Promise<Float32Array> {
  const ctx = new Offline(1, lengthFor(releaseTime, shape), RELEASE_RATE)
  const voice = new VoiceSynthesizer(ctx, ctx.destination)
  if (withoutHold) {
    const gain = (voice as unknown as { gainNode: GainNode }).gainNode.gain
    Object.defineProperty(gain, 'cancelAndHoldAtTime', { value: undefined })
  }
  const instrument = instrumentFor(shape)
  voice.noteOn({ pitch: 69, velocity: 127, instrument }, start)
  voice.noteOff(instrument, releaseTime)
  return Float32Array.from((await ctx.startRendering()).getChannelData(0))
}

/**
 * The envelope as it should sound, scheduled directly: the attack and decay,
 * cut short where the release falls inside them or held at the sustain level
 * where it falls after, then the release. No cancel anywhere.
 */
export async function renderReleaseByHand(
  Offline: OfflineContextConstructor,
  shape: ReleaseShape,
  start: number,
  releaseTime: number
): Promise<Float32Array> {
  const ctx = new Offline(1, lengthFor(releaseTime, shape), RELEASE_RATE)
  const n = normalized(shape)
  const exponential = shape.curve === 'exponential'
  const floor = exponential ? shape.floor : 0
  const sustain = exponential ? Math.max(shape.sustain * RELEASE_PEAK, floor) : shape.sustain * RELEASE_PEAK
  const attackEnd = start + attackOf(n.attack)
  const decayEnd = start + attackOf(n.attack) + decayOf(n.decay)
  const between = (v0: number, v1: number, t0: number, t1: number, t: number) =>
    exponential ? v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0)) : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 440
  const g = gain.gain
  const ramp = (v: number, t: number) =>
    exponential ? g.exponentialRampToValueAtTime(v, t) : g.linearRampToValueAtTime(v, t)
  g.setValueAtTime(floor, start)
  if (releaseTime < attackEnd) {
    ramp(between(floor, RELEASE_PEAK, start, attackEnd, releaseTime), releaseTime)
  } else if (releaseTime < decayEnd) {
    ramp(RELEASE_PEAK, attackEnd)
    ramp(between(RELEASE_PEAK, sustain, attackEnd, decayEnd, releaseTime), releaseTime)
  } else {
    ramp(RELEASE_PEAK, attackEnd)
    ramp(sustain, decayEnd)
    g.setValueAtTime(sustain, releaseTime)
  }
  const release = releaseOf(n.release)
  ramp(floor, releaseTime + release)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(releaseTime + release + 0.01)
  return Float32Array.from((await ctx.startRendering()).getChannelData(0))
}

/** The releases each shape is tested at, from its decay's end as the voice computes it. */
export function releasesFor(shape: ReleaseShape, start: number): Record<string, number> {
  const decayEnd = decayEndOf(shape, start)
  return {
    'mid-decay': decayEnd - shape.decay / 2,
    'exactly at the decay end': decayEnd,
    'one double after the decay end': nextUp(decayEnd),
    '0.4 of a sample after the decay end': decayEnd + 0.4 / RELEASE_RATE,
    'after a hold of 0.1 s': decayEnd + 0.1,
  }
}

/**
 * The largest sample difference from the note's start on, and the reference's
 * peak, so a silent pair cannot pass.
 */
export function largestDifference(
  a: Float32Array,
  b: Float32Array,
  start: number
): { largest: number; peak: number } {
  let largest = 0
  let peak = 0
  for (let i = Math.round(start * RELEASE_RATE); i < Math.max(a.length, b.length); i++) {
    largest = Math.max(largest, Math.abs((a[i] ?? 0) - (b[i] ?? 0)))
    peak = Math.max(peak, Math.abs(b[i] ?? 0))
  }
  return { largest, peak }
}
