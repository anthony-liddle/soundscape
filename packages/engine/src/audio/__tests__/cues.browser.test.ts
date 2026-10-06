import { describe, expect, it } from 'vitest'
import { parseCueDocument } from '../../cues/validate'
import type { CueDocument } from '../../cues/types'
import peachCues from '../../../../../examples/cues/peach.cues.json?raw'
import { ORACLE_START_TIMES, differenceFrom, renderCueAndOracle } from './oracleHarness'
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
  }
})
