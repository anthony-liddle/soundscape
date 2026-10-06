import { describe, expect, it } from 'vitest'
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
 * written by hand, in a real browser, with cancelAndHoldAtTime taken away so
 * the release takes the fallback, as it always does in Firefox. Chromium and
 * WebKit then run the fallback against their own cancel behaviour. The
 * releases fall in the decay, exactly at its end as the voice computes it, a
 * double after, 0.4 of a sample after, which Firefox treated as at the end,
 * and after a hold.
 *
 * The browser's own cancelAndHoldAtTime is not held to the reference here.
 * By the spec's algorithm, holding at a time after the last scheduled event
 * inserts nothing, so the release ramp that follows starts from the decay's
 * end: a sustained note fades through its hold in Chromium, WebKit and
 * node-web-audio-api alike. That is the music path's own behaviour, outside
 * this fix to the fallback.
 */
const Offline = OfflineAudioContext as unknown as OfflineContextConstructor
const TOLERANCE = 1e-6
const STARTS = [ORACLE_START_TIMES[0]!, ORACLE_START_TIMES[5]!]

for (const [name, shape] of Object.entries(RELEASE_SHAPES)) {
  describe(`a voice with ${name}, in this browser`, () => {
    for (const start of STARTS) {
      for (const [where, releaseTime] of Object.entries(releasesFor(shape, start))) {
        it(`released ${where}, starting at ${start.toFixed(3)} s, through the fallback`, async () => {
          const voice = await renderVoiceRelease(Offline, shape, start, releaseTime, true)
          const hand = await renderReleaseByHand(Offline, shape, start, releaseTime)
          const d = largestDifference(voice, hand, start)
          expect(d.peak).toBeGreaterThan(0.1)
          expect(d.largest).toBeLessThan(TOLERANCE)
        })
      }
    }
  })
}
