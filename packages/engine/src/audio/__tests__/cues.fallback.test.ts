import { afterEach, describe, expect, it } from 'vitest'
import { AudioParam, OfflineAudioContext } from 'node-web-audio-api'
import { parseCueDocument } from '../../cues/validate'
import type { CueDocument } from '../../cues/types'
import peachCues from '../../../../../examples/cues/peach.cues.json?raw'
import { ORACLE_START_TIMES, differenceFrom, renderCueAndOracle } from './oracleHarness'
import type { OfflineContextConstructor } from './oracleHarness'
import type { OracleCue } from './oracle'

/**
 * The committed cues held to the oracle in node-web-audio-api with the cancel
 * methods taken away, so the browser's cancel behaviour cannot matter.
 *
 * Without cancelAndHoldAtTime, as in Firefox, the old release fallback held a
 * note at its peak whenever its release time equalled its decay end exactly,
 * which this renderer reproduces. Firefox also broke releases up to half a
 * sample after the decay end, which this renderer cannot reproduce: it keeps a
 * ramp that ends before the cancel time by any amount. Only the Firefox job in
 * the browser tests sees that half.
 */
const parsed = parseCueDocument(peachCues)
const document = (parsed.ok ? parsed.document : null) as CueDocument
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const CUES: OracleCue[] = ['tick', 'found-8-mythic-cute']
const TOLERANCE = 1e-6

const proto = AudioParam.prototype as unknown as Record<string, unknown>
const original = {
  cancelAndHoldAtTime: Object.getOwnPropertyDescriptor(proto, 'cancelAndHoldAtTime')!,
  cancelScheduledValues: Object.getOwnPropertyDescriptor(proto, 'cancelScheduledValues')!,
}
const replace = (name: keyof typeof original, value: unknown) =>
  Object.defineProperty(proto, name, { value, configurable: true, writable: true })

afterEach(() => {
  for (const [name, descriptor] of Object.entries(original)) Object.defineProperty(proto, name, descriptor)
})

describe('the committed cues against the oracle, with the cancel methods taken away', () => {
  for (const cue of CUES) {
    for (const when of ORACLE_START_TIMES) {
      it(`${cue} at ${when.toFixed(3)} s, without cancelAndHoldAtTime as in Firefox`, async () => {
        replace('cancelAndHoldAtTime', undefined)
        const { cue: x, oracle } = await renderCueAndOracle(Offline, document, cue, when)
        expect(differenceFrom(x, oracle, when).largest).toBeLessThan(TOLERANCE)
      })
    }

    it(`${cue} never cancels a scheduled value at all`, async () => {
      const refuse = (name: string) => () => {
        throw new Error(`a cue called ${name}`)
      }
      replace('cancelAndHoldAtTime', refuse('cancelAndHoldAtTime'))
      replace('cancelScheduledValues', refuse('cancelScheduledValues'))
      const when = ORACLE_START_TIMES[0]!
      const { cue: x, oracle } = await renderCueAndOracle(Offline, document, cue, when)
      expect(differenceFrom(x, oracle, when).largest).toBeLessThan(TOLERANCE)
    })
  }
})
