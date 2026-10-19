import { describe, expect, it } from 'vitest'
import { ORACLE_START_TIMES } from './oracleHarness'
import type { OfflineContextConstructor } from './oracleHarness'
import {
  RELEASE_SHAPES,
  largestDifference,
  liveReleasesFor,
  releasesFor,
  renderReleaseByHand,
  renderVoiceRelease,
} from './releaseHarness'

/**
 * A music voice's release, noteOn then noteOff, held to the same envelope
 * written by hand, in a real browser: with the browser's own
 * cancelAndHoldAtTime, and with it taken away, as it always is in Firefox. The
 * releases fall in the decay, exactly at its end as the voice computes it, a
 * double after, 0.4 of a sample after, which Firefox treated as at the end,
 * and after a hold.
 *
 * And as the scheduler releases a note: noteOff called while the render runs,
 * up to 100 ms before the release, after a hold and while the decay still
 * runs. By the spec's algorithm, cancelAndHoldAtTime after the last scheduled
 * event inserts nothing, so a release ramp after it starts from the decay's
 * end, and a held note stepped down the moment noteOff was called, in
 * Chromium and WebKit. The voice never calls it, and ends the envelope at the
 * release's own level. Firefox has no suspend on an OfflineAudioContext, so
 * those cases run in Chromium and WebKit.
 */
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const TOLERANCE = 1e-6
const STARTS = [ORACLE_START_TIMES[0]!, ORACLE_START_TIMES[5]!]

for (const [name, shape] of Object.entries(RELEASE_SHAPES)) {
  describe(`a voice with ${name}, in this browser`, () => {
    for (const start of STARTS) {
      for (const [where, releaseTime] of Object.entries(releasesFor(shape, start))) {
        it.each([
          ['with the browser cancelAndHoldAtTime', false],
          ['with cancelAndHoldAtTime taken away', true],
        ])(`released ${where}, starting at ${start.toFixed(3)} s, %s`, async (_, withoutHold) => {
          const voice = await renderVoiceRelease(Offline, shape, start, releaseTime, withoutHold)
          const hand = await renderReleaseByHand(Offline, shape, start, releaseTime)
          const d = largestDifference(voice, hand, start)
          expect(d.peak).toBeGreaterThan(0.1)
          expect(d.largest).toBeLessThan(TOLERANCE)
        })
      }
      for (const [where, { release, calledAt }] of Object.entries(liveReleasesFor(shape, start))) {
        it.skipIf(!('suspend' in OfflineAudioContext.prototype))(
          `released ${where}, starting at ${start.toFixed(3)} s`,
          async () => {
            const voice = await renderVoiceRelease(Offline, shape, start, release, false, calledAt)
            const hand = await renderReleaseByHand(Offline, shape, start, release)
            const d = largestDifference(voice, hand, start)
            expect(d.peak).toBeGreaterThan(0.1)
            expect(d.largest).toBeLessThan(TOLERANCE)
          }
        )
      }
    }
  })
}
