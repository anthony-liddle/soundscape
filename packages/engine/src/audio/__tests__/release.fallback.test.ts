import { describe, expect, it } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { ORACLE_START_TIMES } from './oracleHarness'
import type { OfflineContextConstructor } from './oracleHarness'
import {
  RELEASE_SHAPES,
  largestDifference,
  releasesFor,
  renderReleaseByHand,
  renderVoiceRelease,
} from './releaseHarness'

/**
 * A music voice's release, noteOn then noteOff, held to the same envelope
 * written by hand, in node-web-audio-api: with cancelAndHoldAtTime as this
 * renderer has it, and taken away as in Firefox. The voice never calls it, so
 * both come out as the envelope should sound. The releases fall in the decay,
 * exactly at its end as the voice computes it, a double after, 0.4 of a sample
 * after, and after a hold.
 *
 * This renderer keeps a ramp that ends before a cancel time by any amount, so
 * here only a release exactly at the decay's end could lose the decay. Firefox
 * loses it up to half a sample later too; the browser tests cover that.
 *
 * Holding with cancelAndHoldAtTime at a time after the last scheduled event
 * inserts nothing, by the spec's algorithm, so a release ramp after it would
 * start from the decay's end: a held note would fade through its hold, or,
 * released while it plays, step down when noteOff is called. The voice ends
 * the envelope at the release's own level instead.
 */
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const TOLERANCE = 1e-6
const STARTS = [ORACLE_START_TIMES[0]!, ORACLE_START_TIMES[5]!]

for (const [name, shape] of Object.entries(RELEASE_SHAPES)) {
  describe(`a voice with ${name}, in node-web-audio-api`, () => {
    for (const start of STARTS) {
      for (const [where, releaseTime] of Object.entries(releasesFor(shape, start))) {
        it.each([
          ['with cancelAndHoldAtTime as this renderer has it', false],
          ['with cancelAndHoldAtTime taken away, as in Firefox', true],
        ])(`released ${where}, starting at ${start.toFixed(3)} s, %s`, async (_, withoutHold) => {
          const voice = await renderVoiceRelease(Offline, shape, start, releaseTime, withoutHold)
          const hand = await renderReleaseByHand(Offline, shape, start, releaseTime)
          const d = largestDifference(voice, hand, start)
          expect(d.peak).toBeGreaterThan(0.1)
          expect(d.largest).toBeLessThan(TOLERANCE)
        })
      }
    }
  })
}
