import { describe, expect, it } from 'vitest'
import { parseCueDocument } from '../../cues/validate'
import type { CueDocument, CueInstrument } from '../../cues/types'
import peachCues from '../../../../../examples/cues/peach.cues.json?raw'
import { AudioEngine } from '../AudioEngine'
import { midiToFrequency } from '../../utils/pitch'
import { ORACLE_RATE, ORACLE_START_TIMES, differenceFrom, renderCueAndOracle } from './oracleHarness'
import type { OfflineContextConstructor } from './oracleHarness'
import type { OracleCue } from './oracle'

/**
 * The committed cues held to the oracle in a real browser: Chromium, Firefox
 * and WebKit, through vitest.browser.config.ts. Each cue and its oracle are
 * rendered offline in the same browser in the same run, at start times in
 * every binade from 0.128 to 9.749 s, and compared sample by sample.
 *
 * Firefox has no cancelAndHoldAtTime, so the engine's release fallback, which
 * the other two browsers never reach, is what this exercises there.
 */
const parsed = parseCueDocument(peachCues)
const document = (parsed.ok ? parsed.document : null) as CueDocument
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const CUES: OracleCue[] = ['tick', 'found-8-mythic-cute']

const TOLERANCE = 1e-6

describe('the committed cues against the oracle, in this browser', () => {
  it('names the browser and whether it has cancelAndHoldAtTime', () => {
    console.log(
      `${navigator.userAgent}; cancelAndHoldAtTime: ${typeof AudioParam.prototype.cancelAndHoldAtTime}`
    )
    expect(parsed.ok).toBe(true)
  })

  for (const cue of CUES) {
    for (const when of ORACLE_START_TIMES) {
      it(`${cue} at ${when.toFixed(3)} s matches the oracle`, async () => {
        const { cue: x, oracle } = await renderCueAndOracle(Offline, document, cue, when)
        const d = differenceFrom(x, oracle, when)
        expect(d.oraclePeak).toBeGreaterThan(0.01)
        expect(d.largest).toBeLessThan(TOLERANCE)
      })
    }

    it(`${cue} renders the same with every cancel method made to throw`, async () => {
      // A cue schedules each note whole and never cancels, so it cannot depend
      // on cancelAndHoldAtTime, or on how this browser cancels a ramp
      const proto = AudioParam.prototype as unknown as Record<string, unknown>
      const saved = (['cancelScheduledValues', 'cancelAndHoldAtTime'] as const).map(
        (name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const
      )
      try {
        for (const [name] of saved) {
          Object.defineProperty(proto, name, {
            configurable: true,
            writable: true,
            value: () => {
              throw new Error(`a cue called ${name}`)
            },
          })
        }
        const when = ORACLE_START_TIMES[0]!
        const { cue: x, oracle } = await renderCueAndOracle(Offline, document, cue, when)
        expect(differenceFrom(x, oracle, when).largest).toBeLessThan(TOLERANCE)
      } finally {
        for (const [name, descriptor] of saved) {
          if (descriptor) Object.defineProperty(proto, name, descriptor)
          else delete proto[name]
        }
      }
    })
  }
})

describe('a cue note that holds a sustain level, then releases, in this browser', () => {
  // 12 ms attack, 50 ms decay to 0.4 of the peak, held until 250 ms, then a
  // 100 ms release, all exponential: written in the engine's normalized units
  const ATTACK = 0.012
  const DECAY = 0.05
  const RELEASE = 0.1
  const DURATION = 0.25
  const PEAK = 0.3
  const SUSTAIN = 0.4
  const FLOOR = 1e-4
  // The committed sine, with a decay of fixed length, so the sustain level holds
  const sine = Object.fromEntries(
    Object.entries(document.instruments.sine!).filter(([key]) => key !== 'decayUntilRelease')
  ) as Omit<CueInstrument, 'decay' | 'decayUntilRelease'>
  const held: CueDocument = {
    format: 'soundscape-cues',
    version: 1,
    instruments: {
      held: {
        ...sine,
        attack: Math.sqrt((ATTACK - 0.001) / 1.999),
        decay: Math.sqrt((DECAY - 0.01) / 2.99),
        sustain: SUSTAIN,
        release: Math.sqrt((RELEASE - 0.01) / 4.99),
        envelopeFloor: FLOOR,
      },
    },
    cues: { held: { notes: [{ id: 'a4', instrument: 'held', start: 0, duration: DURATION, pitch: 69, level: PEAK }] } },
  }

  /** The same note written directly in Web Audio, with no Soundscape code. */
  function playByHand(ctx: BaseAudioContext, t0: number): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 440
    gain.gain.setValueAtTime(FLOOR, t0)
    gain.gain.exponentialRampToValueAtTime(PEAK, t0 + ATTACK)
    gain.gain.exponentialRampToValueAtTime(SUSTAIN * PEAK, t0 + ATTACK + DECAY)
    gain.gain.setValueAtTime(SUSTAIN * PEAK, t0 + DURATION)
    gain.gain.exponentialRampToValueAtTime(FLOOR, t0 + DURATION + RELEASE)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + DURATION + RELEASE + 0.01)
  }

  for (const when of [ORACLE_START_TIMES[0]!, ORACLE_START_TIMES[5]!]) {
    it(`at ${when.toFixed(3)} s it matches the same envelope written by hand`, async () => {
      const length = Math.ceil((when + 0.5) * ORACLE_RATE)
      const engineContext = new Offline(1, length, ORACLE_RATE)
      const engine = new AudioEngine({ context: engineContext })
      await engine.initialize()
      engine.loadCues(held)
      engine.playCue('held', when)
      const x = Float32Array.from((await engineContext.startRendering()).getChannelData(0))
      const handContext = new Offline(1, length, ORACLE_RATE)
      playByHand(handContext, when)
      const y = Float32Array.from((await handContext.startRendering()).getChannelData(0))
      const d = differenceFrom(x, y, when)
      expect(d.oraclePeak).toBeGreaterThan(0.25)
      expect(d.largest).toBeLessThan(TOLERANCE)
    })
  }
})

describe("one cue instrument whose decay lasts until each note's release, in this browser", () => {
  // 12 ms attack, then a decay to 0.4 of the peak that ends at each note's
  // release, however long the note, then a 100 ms release
  const ATTACK = 0.012
  const RELEASE = 0.1
  const PEAK = 0.3
  const SUSTAIN = 0.4
  const FLOOR = 1e-4
  // Two lengths on the one instrument, the second starting as the first releases
  const NOTES = [
    { id: 'short', pitch: 69, start: 0, duration: 0.12 },
    { id: 'long', pitch: 76, start: 0.2, duration: 0.3 },
  ]
  const untilRelease: CueDocument = {
    format: 'soundscape-cues',
    version: 1,
    instruments: {
      fading: {
        ...document.instruments.sine!,
        attack: Math.sqrt((ATTACK - 0.001) / 1.999),
        sustain: SUSTAIN,
        release: Math.sqrt((RELEASE - 0.01) / 4.99),
        envelopeFloor: FLOOR,
      },
    },
    cues: { both: { notes: NOTES.map((n) => ({ ...n, instrument: 'fading', level: PEAK })) } },
  }

  /** The same notes written directly in Web Audio, with no Soundscape code. */
  function playByHand(ctx: BaseAudioContext, t0: number): void {
    for (const n of NOTES) {
      const at = t0 + n.start
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = midiToFrequency(n.pitch)
      gain.gain.setValueAtTime(FLOOR, at)
      gain.gain.exponentialRampToValueAtTime(PEAK, at + ATTACK)
      gain.gain.exponentialRampToValueAtTime(SUSTAIN * PEAK, at + n.duration)
      gain.gain.setValueAtTime(SUSTAIN * PEAK, at + n.duration)
      gain.gain.exponentialRampToValueAtTime(FLOOR, at + n.duration + RELEASE)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + n.duration + RELEASE + 0.01)
    }
  }

  for (const when of [ORACLE_START_TIMES[0]!, ORACLE_START_TIMES[5]!]) {
    it(`at ${when.toFixed(3)} s each note decays over its own length, as written by hand`, async () => {
      const length = Math.ceil((when + 0.75) * ORACLE_RATE)
      const engineContext = new Offline(1, length, ORACLE_RATE)
      const engine = new AudioEngine({ context: engineContext })
      await engine.initialize()
      engine.loadCues(untilRelease)
      engine.playCue('both', when)
      const x = Float32Array.from((await engineContext.startRendering()).getChannelData(0))
      const handContext = new Offline(1, length, ORACLE_RATE)
      playByHand(handContext, when)
      const y = Float32Array.from((await handContext.startRendering()).getChannelData(0))
      const d = differenceFrom(x, y, when)
      expect(d.oraclePeak).toBeGreaterThan(0.25)
      expect(d.largest).toBeLessThan(TOLERANCE)
    })
  }
})
