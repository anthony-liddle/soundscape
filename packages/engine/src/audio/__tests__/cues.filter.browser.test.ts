import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCueDocument } from '../../cues/validate'
import type { CueDocument, CueInstrument } from '../../cues/types'
import peachCues from '../../../../../examples/cues/peach.cues.json?raw'
import { AudioEngine } from '../AudioEngine'
import { RUNG_OUT } from '../EffectsChain'
import { VoiceSynthesizer, filterTail } from '../VoiceSynthesizer'
import { normalizedToFilterFreq, normalizedToQ } from '../../utils/pitch'

/**
 * A filtered cue's ring after its note stops (#128), in Chromium, Firefox and
 * WebKit. A resonant filter goes on sounding once its oscillator has stopped,
 * and the cue must play that ring out whole, the same on every render.
 *
 * A cue voice was once disconnected when the browser reported its
 * oscillator's end. Chromium and WebKit report it during an offline render,
 * soon after the note stops, at a point that varies, so the ring was cut
 * somewhere different every time. Firefox reports it after the render.
 */
const parsed = parseCueDocument(peachCues)
const peach = (parsed.ok ? parsed.document : null) as CueDocument
const RATE = 48000
const START = 0.05
/** The note's oscillator stops 10 ms after its 10 ms release. */
const STOPS_AT = START + 0.17

type Filter = Pick<CueInstrument, 'filterType' | 'filterCutoff' | 'filterResonance'>
const sine = (filter: Filter): CueInstrument => ({ ...peach.instruments.sine!, ...filter })
const oneNote = (instrument: CueInstrument): CueDocument => ({
  format: 'soundscape-cues',
  version: 1,
  instruments: { sine: instrument },
  cues: { g: { notes: [{ id: 'g1', instrument: 'sine', start: 0, duration: 0.15, pitch: 55, level: 0.4 }] } },
})
/** A lowpass at 28 Hz with 20 dB of resonance: it rings for nearly 2 s. */
const RESONANT: Filter = { filterType: 'lowpass', filterCutoff: 0.05, filterResonance: 1 }
const FILTERED = oneNote(sine(RESONANT))

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Seconds a lowpass with these settings rings once its input stops, until its
 * level has fallen to 2^-24 of where it was, worked out here from the Web
 * Audio spec's biquad, not by the engine: the poles of a lowpass whose Q is in
 * dB lie at radius sqrt((1 - alpha) / (1 + alpha)).
 */
function lowpassRing(filter: Filter): number {
  const w0 = (2 * Math.PI * normalizedToFilterFreq(filter.filterCutoff)) / RATE
  const alpha = Math.sin(w0) / (2 * 10 ** (normalizedToQ(filter.filterResonance) / 20))
  const radius = Math.sqrt((1 - alpha) / (1 + alpha))
  return Math.ceil(Math.log(2 ** -24) / Math.log(radius)) / RATE
}

/**
 * Play the cue g from `cues` at START, offline. With `keepVoices`, no voice is
 * ever disconnected in this render: a reference with every ring whole.
 */
async function render(cues: CueDocument, seconds: number, keepVoices = false): Promise<Float32Array> {
  const kept = keepVoices ? vi.spyOn(VoiceSynthesizer.prototype, 'dispose').mockImplementation(() => {}) : null
  try {
    const ctx = new OfflineAudioContext(1, Math.round(seconds * RATE), RATE)
    const engine = new AudioEngine({ context: ctx })
    await engine.initialize()
    engine.loadCues(cues)
    engine.playCue('g', START)
    return Float32Array.from((await ctx.startRendering()).getChannelData(0))
  } finally {
    kept?.mockRestore()
  }
}

const largestDifference = (a: Float32Array, b: Float32Array) => {
  let largest = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) largest = Math.max(largest, Math.abs((a[i] ?? 0) - (b[i] ?? 0)))
  return largest
}
const peakIn = (x: Float32Array, from: number, to: number) => {
  let peak = 0
  for (let i = Math.round(from * RATE); i < Math.min(x.length, Math.round(to * RATE)); i++) peak = Math.max(peak, Math.abs(x[i]!))
  return peak
}

describe('a filtered cue, in this browser', () => {
  it('rings out whole, the same on all 20 renders', async () => {
    // To where the ring has fallen to 2^-24 of its level at the stop, and no further
    const seconds = STOPS_AT + lowpassRing(RESONANT)
    const whole = await render(FILTERED, seconds, true)
    expect(peakIn(whole, STOPS_AT, STOPS_AT + 0.1)).toBeGreaterThan(1e-3)
    const differences: number[] = []
    for (let i = 0; i < 20; i++) differences.push(largestDifference(await render(FILTERED, seconds), whole))
    expect(differences).toEqual(Array(20).fill(0))
  })

  it('plays its ring out whole through an echo when the document is replaced under it', async () => {
    // A ring of nearly 2 s through one echo, whose delay alone would let the
    // replaced chain go 55 ms after the note stops
    const ringing = oneNote({ ...sine(RESONANT), delayTime: 0.05, delayMix: 0.4 })
    const plain = await render(ringing, 0.8)
    const ctx = new OfflineAudioContext(1, Math.round(0.8 * RATE), RATE)
    const engine = new AudioEngine({ context: ctx })
    await engine.initialize()
    engine.loadCues(ringing)
    engine.playCue('g', START)
    engine.loadCues(FILTERED)
    const replaced = Float32Array.from((await ctx.startRendering()).getChannelData(0))
    expect(peakIn(plain, 0.4, 0.5)).toBeGreaterThan(1e-4)
    expect(largestDifference(replaced, plain)).toBe(0)
  })

  // Each type a voice has: the longest ring of all, rings that fade before a
  // cycle, and a repeated pole, at a bandpass's least resonance
  const FILTERS: Record<string, Filter> = {
    'a resonant lowpass': RESONANT,
    'a resonant highpass': { filterType: 'highpass', filterCutoff: 0.3, filterResonance: 1 },
    'a bandpass at 20 Hz with a Q of 20, the longest ring': { filterType: 'bandpass', filterCutoff: 0, filterResonance: 1 },
    'a notch': { filterType: 'notch', filterCutoff: 0.2, filterResonance: 0.5 },
    'a bandpass at its least resonance, a repeated pole': { filterType: 'bandpass', filterCutoff: 0.3, filterResonance: 0 },
  }
  for (const [name, filter] of Object.entries(FILTERS)) {
    it(`keeps ${name} until it has rung out to 2^-24 of the ring heard, then disconnects it`, async () => {
      const cues = oneNote(sine(filter))
      const deadline = STOPS_AT + filterTail(filter, RATE)
      const seconds = deadline + 0.5
      const whole = await render(cues, seconds, true)
      const dispose = vi.spyOn(VoiceSynthesizer.prototype, 'dispose')
      const kept = await render(cues, seconds)
      const end = Math.round(deadline * RATE)
      // What the reference still holds past the deadline is what may be cut
      const heard = peakIn(whole, STOPS_AT, deadline)
      expect(heard).toBeGreaterThan(0)
      expect(peakIn(whole, deadline, seconds)).toBeLessThanOrEqual(RUNG_OUT * heard)
      expect(largestDifference(kept.subarray(0, end), whole.subarray(0, end))).toBe(0)
      expect(largestDifference(kept.subarray(end), whole.subarray(end))).toBeLessThanOrEqual(RUNG_OUT * heard)
      // and the voice is disconnected, by its own clock
      await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1), { timeout: 5000 })
    })
  }
})

describe('cue voices, in this browser', () => {
  it('are every one disconnected by their own clocks after 50 filtered plays', async () => {
    // Each voice's filter rings out within about 0.03 s of its note's stop
    const short = oneNote(sine({ filterType: 'lowpass', filterCutoff: 0.5, filterResonance: 0.5 }))
    const dispose = vi.spyOn(VoiceSynthesizer.prototype, 'dispose')
    const ctx = new OfflineAudioContext(1, 2 * RATE, RATE)
    const engine = new AudioEngine({ context: ctx })
    await engine.initialize()
    for (let i = 0; i < 50; i++) {
      engine.loadCues(short)
      engine.playCue('g', START + i * 0.02)
    }
    await ctx.startRendering()
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(50), { timeout: 5000 })
    expect(new Set(dispose.mock.contexts).size).toBe(50)
    expect((engine as unknown as { cueVoices: Set<unknown> }).cueVoices.size).toBe(0)
  })
})
