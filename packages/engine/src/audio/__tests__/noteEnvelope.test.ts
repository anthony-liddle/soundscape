import { describe, expect, it } from 'vitest'
import { VoiceSynthesizer, envelopeLevelAt, noteEnvelope } from '../VoiceSynthesizer'
import type { EnvelopeEvent, EnvelopeShape } from '../VoiceSynthesizer'
import { createMockAudioContext } from './mockWebAudio'
import type { MockNode } from './mockWebAudio'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'
import { normalizedToADSR } from '../../utils/time'

/**
 * A whole note's envelope, planned once and never cancelled. Where the release
 * falls, in the attack, in the decay or after it, picks the plan's branch, and
 * the branches meet at their boundaries, so a release a hair either side of
 * one sounds the same.
 */

/** The next double above or below x. */
function nextAfter(x: number, direction: 1 | -1): number {
  const buffer = new DataView(new ArrayBuffer(8))
  buffer.setFloat64(0, x)
  const bits = buffer.getBigUint64(0)
  buffer.setBigUint64(0, x > 0 === direction > 0 ? bits + 1n : bits - 1n)
  return buffer.getFloat64(0)
}

/** The value an automation timeline has at t, as Web Audio computes it. */
function valueAt(events: EnvelopeEvent[], curve: EnvelopeShape['curve'], t: number): number {
  let t0 = -Infinity
  let v0 = 0
  for (const e of events) {
    if (t < e.at) {
      if (e.kind === 'set') return v0
      const f = (t - t0) / (e.at - t0)
      return curve === 'exponential' ? v0 * Math.pow(e.value / v0, f) : v0 + (e.value - v0) * f
    }
    t0 = e.at
    v0 = e.value
  }
  return v0
}

/** The envelope as it should sound: the unreleased curve, then the release from wherever it was. */
function intended(shape: EnvelopeShape, releaseAt: number, t: number): number {
  if (t < releaseAt) return envelopeLevelAt(shape, t)
  const from = envelopeLevelAt(shape, releaseAt)
  const f = Math.min(1, (t - releaseAt) / shape.release)
  return shape.curve === 'exponential' ? from * Math.pow(shape.floor / from, f) : from + (shape.floor - from) * f
}

const shapes: Record<string, EnvelopeShape> = {
  'exponential, decaying to its floor': {
    curve: 'exponential', attack: 0.012, decay: 0.268, release: 0.01, floor: 1.8e-5, peak: 0.162, sustain: 1.8e-5,
  },
  'exponential, holding a sustain level': {
    curve: 'exponential', attack: 0.012, decay: 0.05, release: 0.1, floor: 1e-4, peak: 0.3, sustain: 0.12,
  },
  'linear, holding a sustain level': {
    curve: 'linear', attack: 0.02, decay: 0.08, release: 0.2, floor: 0, peak: 0.3, sustain: 0.15,
  },
}

describe('noteEnvelope', () => {
  for (const [name, shape] of Object.entries(shapes)) {
    describe(name, () => {
      const decayEnd = shape.attack + shape.decay
      const releases: Record<string, number> = {
        'in the attack': shape.attack / 2,
        'an ulp before the attack ends': nextAfter(shape.attack, -1),
        'exactly at the attack end': shape.attack,
        'an ulp after the attack ends': nextAfter(shape.attack, 1),
        'in the decay': shape.attack + shape.decay / 2,
        'an ulp before the decay ends': nextAfter(decayEnd, -1),
        'exactly at the decay end': decayEnd,
        'an ulp after the decay ends': nextAfter(decayEnd, 1),
        'half a sample after the decay ends': decayEnd + 0.5 / 48000,
        'after a hold': decayEnd + 0.1,
      }
      for (const [where, releaseAt] of Object.entries(releases)) {
        it(`released ${where}, it plays the intended envelope`, () => {
          const events = noteEnvelope(shape, releaseAt)
          const end = releaseAt + shape.release + 0.05
          for (let i = 0; i <= 2000; i++) {
            const t = (end * i) / 2000
            const want = intended(shape, releaseAt, t)
            expect(Math.abs(valueAt(events, shape.curve, t) - want)).toBeLessThanOrEqual(1e-12 + 1e-9 * want)
          }
        })
      }

      it('lists its events in time order, and holds the sustain level until the release', () => {
        const events = noteEnvelope(shape, decayEnd + 0.1)
        for (let i = 1; i < events.length; i++) expect(events[i]!.at).toBeGreaterThanOrEqual(events[i - 1]!.at)
        expect(events.at(-2)).toEqual({ kind: 'set', at: decayEnd + 0.1, value: shape.sustain })
      })
    })
  }
})

describe('VoiceSynthesizer.playNote', () => {
  // Peach's found note: a 12 ms attack, a decay to the floor that ends at the
  // note's duration, and the shortest release
  const instrument: InstrumentParams = {
    ...defaultInstrumentParams,
    waveform: 'sine',
    attack: Math.sqrt((0.012 - 0.001) / 1.999),
    decay: Math.sqrt((0.268 - 0.01) / 2.99),
    sustain: 0,
    release: 0,
    filterType: 'none',
    envelopeCurve: 'exponential',
    envelopeFloor: 1.8e-5,
    velocityResponse: 0,
  }
  const decayEnd = normalizedToADSR(instrument.attack, 'attack') + normalizedToADSR(instrument.decay, 'decay')

  function play(start: number, duration: number) {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode)
    voice.playNote({ pitch: 79, velocity: 127, instrument, peak: 0.162, setAsValues: true }, start, duration)
    return ctx.createdNodes
  }
  const gainOf = (nodes: MockNode[]) => nodes.find((n) => n.kind === 'gain')!.gain

  // One start in each binade from an eighth of a second to about an hour, on
  // the 48 kHz render-quantum grid, and releases exactly at the decay's end
  // and a few ulps either side of it
  const starts = [48, 281, 563, 1125, 2063, 3656, 7313, 15000, 120000, 1300000].map((q) => (q * 128) / 48000)
  const durations = [-3, -2, -1, 0, 1, 2, 3].map((ulps) => {
    let d = decayEnd
    for (let i = 0; i < Math.abs(ulps); i++) d = nextAfter(d, ulps > 0 ? 1 : -1)
    return d
  })

  it('schedules every event in time order, wherever the start falls and however the release rounds', () => {
    for (const start of starts) {
      for (const duration of durations) {
        const times = gainOf(play(start, duration)).calls.map((c) => c.time)
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]!)
      }
    }
  })

  it('never cancels or holds a scheduled value, on any param', () => {
    for (const start of starts) {
      for (const duration of durations) {
        for (const node of play(start, duration)) {
          for (const param of [node.gain, node.frequency, node.detune, node.Q]) {
            expect(param.cancelScheduledValues).not.toHaveBeenCalled()
            expect(param.cancelAndHoldAtTime).not.toHaveBeenCalled()
          }
        }
      }
    }
  })

  it("stops the oscillator after the release, as Peach's note stops 20 ms after its duration", () => {
    const osc = play(starts[0]!, 0.28).find((n) => n.kind === 'oscillator')!
    expect(osc.stopped).toEqual([starts[0]! + 0.28 + 0.01 + 0.01])
  })
})
