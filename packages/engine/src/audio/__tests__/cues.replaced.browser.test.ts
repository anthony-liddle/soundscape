import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCueDocument } from '../../cues/validate'
import type { CueDocument, CueInstrument } from '../../cues/types'
import peachCues from '../../../../../examples/cues/peach.cues.json?raw'
import { AudioEngine } from '../AudioEngine'
import { EffectsChain, RUNG_OUT, delayTail } from '../EffectsChain'
import { VoiceSynthesizer } from '../VoiceSynthesizer'

/**
 * A cue ringing through its echoes when the cue document is replaced under it
 * (#123), in Chromium, Firefox and WebKit. It must play out exactly as if the
 * document had stayed, every echo after its note included.
 *
 * The replaced cue's chain was once disconnected when the browser reported
 * its note's end. Chromium and WebKit report it during an offline render, as
 * soon as the note stops, so the echoes went silent. Firefox reports it after
 * a render this short has finished, so the straight render passed there. It
 * has no suspend on an offline context, so the cases that hold the render at
 * a suspension skip it.
 */
const parsed = parseCueDocument(peachCues)
const peach = (parsed.ok ? parsed.document : null) as CueDocument
const RATE = 48000
const START = 0.05
/** The note stops at START + 0.17 s; its echoes ring well past this. */
const SUSPEND_AT = 0.4
const canSuspend = 'suspend' in OfflineAudioContext.prototype

type Delay = Partial<Pick<CueInstrument, 'delayTime' | 'delayFeedback' | 'delayMix'>>
const sine = (delay: Delay): CueInstrument => ({ ...peach.instruments.sine!, ...delay })
const oneNote = (instrument: CueInstrument, pitch: number): CueDocument => ({
  format: 'soundscape-cues',
  version: 1,
  instruments: { sine: instrument },
  cues: { g: { notes: [{ id: 'g1', instrument: 'sine', start: 0, duration: 0.15, pitch, level: 0.4 }] } },
})
const ECHO = oneNote(sine({ delayTime: 0.1, delayFeedback: 0.5, delayMix: 0.4 }), 55)
const OTHER = oneNote(sine({}), 60)

afterEach(() => {
  vi.restoreAllMocks()
})

const dispose = VoiceSynthesizer.prototype.dispose

/** Resolves once the engine has handled a voice's end; rejects if none has within a second. */
function aVoiceEnds(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No voice reported its end by the suspension')), 1000)
    const spy = vi.spyOn(VoiceSynthesizer.prototype, 'dispose').mockImplementation(function (this: VoiceSynthesizer) {
      dispose.call(this)
      spy.mockRestore()
      clearTimeout(timer)
      resolve()
    })
  })
}

interface Plan {
  /** Load another document straight after playing the cue, or at the suspension. */
  replace?: 'at once' | 'at the suspension'
  /** Hold the render at SUSPEND_AT until the note's end has been reported. */
  suspend?: boolean
}

/** Play the cue g from `cues` at START, offline, as `plan` says. */
async function render(cues: CueDocument, seconds: number, plan: Plan = {}): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * RATE), RATE)
  const engine = new AudioEngine({ context: ctx })
  await engine.initialize()
  engine.loadCues(cues)
  const ended = plan.suspend ? aVoiceEnds() : null
  engine.playCue('g', START)
  if (plan.replace === 'at once') engine.loadCues(OTHER)
  const suspension = ended
    ? ctx.suspend(SUSPEND_AT).then(async () => {
        try {
          await ended
          if (plan.replace === 'at the suspension') engine.loadCues(OTHER)
        } finally {
          void ctx.resume()
        }
      })
    : null
  const out = Float32Array.from((await ctx.startRendering()).getChannelData(0))
  await suspension
  return out
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

describe('a cue ringing through its echoes when the document is replaced under it, in this browser', () => {
  it('plays out as if the document had stayed, rendered straight through', async () => {
    const plain = await render(ECHO, 0.8)
    const replaced = await render(ECHO, 0.8, { replace: 'at once' })
    expect(peakIn(plain, SUSPEND_AT, 0.6)).toBeGreaterThan(0.01)
    expect(largestDifference(replaced, plain)).toBe(0)
  })

  it.skipIf(!canSuspend)("plays out as if the document had stayed, its note's end reported before its echoes render", async () => {
    const plain = await render(ECHO, 0.8)
    // Holding the render at the suspension changes nothing by itself
    expect(largestDifference(await render(ECHO, 0.8, { suspend: true }), plain)).toBe(0)
    const replaced = await render(ECHO, 0.8, { replace: 'at once', suspend: true })
    expect(largestDifference(replaced, plain)).toBe(0)
  })

  it.skipIf(!canSuspend)('plays out as if the document had stayed, replaced after its note has ended', async () => {
    const plain = await render(ECHO, 0.8)
    const replaced = await render(ECHO, 0.8, { replace: 'at the suspension', suspend: true })
    expect(largestDifference(replaced, plain)).toBe(0)
  })
})

describe('a replaced cue chain, in this browser', () => {
  it('rings until every echo still to come is under 2^-24 of one heard, the longest echo a cue can have, then is disconnected', async () => {
    // Feedback 0.9 at the longest delay: the engine waits 158 passes of 1 s
    const instrument = sine({ delayTime: 1, delayFeedback: 1, delayMix: 0.5 })
    const longest = oneNote(instrument, 55)
    const stopsAt = START + 0.17
    const deadline = stopsAt + delayTail({ ...instrument }, RATE)
    const disconnect = vi.spyOn(EffectsChain.prototype, 'disconnect')
    const seconds = deadline + 1
    const plain = await render(longest, seconds)
    const replaced = await render(longest, seconds, { replace: 'at once' })
    const end = Math.round(deadline * RATE)
    // The plain render's tail past the deadline is what the engine may cut
    const heard = peakIn(plain, stopsAt, deadline)
    expect(heard).toBeGreaterThan(0.01)
    expect(peakIn(plain, deadline, seconds)).toBeLessThanOrEqual(RUNG_OUT * heard)
    // and one pass sooner would cut an echo above it
    expect(peakIn(plain, deadline - 1 - 129 / RATE, seconds)).toBeGreaterThan(RUNG_OUT * heard)
    expect(largestDifference(replaced.subarray(0, end), plain.subarray(0, end))).toBe(0)
    expect(largestDifference(replaced.subarray(end), plain.subarray(end))).toBeLessThanOrEqual(RUNG_OUT * heard)
    // The replaced render's chain is disconnected, by its own clock
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1), { timeout: 5000 })
  })

  it('leaves no chain connected after the document is replaced 50 times while cues ring', async () => {
    // Each chain rings out within about 0.5 s of its note's stop
    const short = oneNote(sine({ delayTime: 0.05, delayFeedback: 0.2, delayMix: 0.4 }), 55)
    const disconnect = vi.spyOn(EffectsChain.prototype, 'disconnect')
    const ctx = new OfflineAudioContext(1, 2 * RATE, RATE)
    const engine = new AudioEngine({ context: ctx })
    await engine.initialize()
    for (let i = 0; i < 50; i++) {
      engine.loadCues(short)
      engine.playCue('g', START + i * 0.02)
    }
    // A document with no effects, so every chain made is one replaced
    engine.loadCues(OTHER)
    expect(disconnect).not.toHaveBeenCalled()
    const out = (await ctx.startRendering()).getChannelData(0)
    expect(peakIn(out, 1, 1.1)).toBeGreaterThan(0.01)
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(50), { timeout: 5000 })
    expect(new Set(disconnect.mock.contexts).size).toBe(50)
    expect((engine as unknown as { retiredCueChains: Map<unknown, unknown> }).retiredCueChains.size).toBe(0)
  })
})
