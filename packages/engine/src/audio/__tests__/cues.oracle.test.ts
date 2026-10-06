import { describe, expect, it } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { parseCueDocument } from '../../cues/validate'
import type { CueDocument } from '../../cues/types'
import peachCues from '../../../../../examples/cues/peach.cues.json?raw'
import { ORACLE_START_TIMES, differenceFrom, renderCueAndOracle } from './oracleHarness'
import type { OfflineContextConstructor } from './oracleHarness'
import type { OracleCue } from './oracle'

/**
 * The committed cues held to the oracle, Peach's two sounds written in plain
 * Web Audio with no Soundscape code, rendered in node-web-audio-api in the
 * same run. The browser tests run the same comparison in Chromium, Firefox
 * and WebKit, where it matters most.
 */
const parsed = parseCueDocument(peachCues)
const document = (parsed.ok ? parsed.document : null) as CueDocument
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const CUES: OracleCue[] = ['tick', 'found-8-mythic-cute']

/** Far below the 0.18 by which a held note missed, and far above rounding. */
const TOLERANCE = 1e-6

describe('the committed cues against the oracle, in node-web-audio-api', () => {
  it('reads the committed document', () => {
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

  it('can fail: a cue one per cent too loud does not match', async () => {
    const louder = structuredClone(document)
    louder.cues.tick!.notes[0]!.level *= 1.01
    const when = ORACLE_START_TIMES[0]!
    const { cue: x, oracle } = await renderCueAndOracle(Offline, louder, 'tick', when)
    expect(differenceFrom(x, oracle, when).largest).toBeGreaterThan(TOLERANCE * 100)
  })
})
