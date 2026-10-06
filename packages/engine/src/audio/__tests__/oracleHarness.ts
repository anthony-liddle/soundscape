import { AudioEngine } from '../AudioEngine'
import type { CueDocument } from '../../cues/types'
import { playOracle } from './oracle'
import type { OracleCue } from './oracle'

/**
 * Renders a committed cue through the engine and through the oracle, each into
 * its own offline context of the same shape, so the two can be compared in the
 * same renderer and the same run. Nothing here is specific to one renderer: it
 * runs in node-web-audio-api and in a real browser alike.
 */
export const ORACLE_RATE = 48000

/**
 * Start times on the 48 kHz render-quantum grid, one in each binade from an
 * eighth of a second to 16 s: about 0.128, 0.749, 1.501, 3, 5.501 and 9.749 s.
 * Whether Firefox broke a note under the old release fallback depended on the
 * binade of its start time, so each binade gets one, including 8 to 16 s,
 * where it behaved differently from the rest.
 */
export const ORACLE_START_TIMES: readonly number[] = [48, 281, 563, 1125, 2063, 3656].map(
  (quanta) => (quanta * 128) / ORACLE_RATE
)

/** How long after its start a render runs: the longest cue stops at 0.3 s. */
const SPAN = 0.4

export type OfflineContextConstructor = new (
  channels: number,
  length: number,
  sampleRate: number
) => OfflineAudioContext

export interface CueAndOracle {
  cue: Float32Array
  oracle: Float32Array
}

/** Render `cue` from `document` at `when`, and the oracle's version of it at the same time. */
export async function renderCueAndOracle(
  Offline: OfflineContextConstructor,
  document: CueDocument,
  cue: OracleCue,
  when: number
): Promise<CueAndOracle> {
  const length = Math.ceil((when + SPAN) * ORACLE_RATE)

  const engineContext = new Offline(1, length, ORACLE_RATE)
  const engine = new AudioEngine({ context: engineContext })
  await engine.initialize()
  engine.loadCues(document)
  engine.playCue(cue, when)
  // Copied at once: a renderer may reuse the buffer's memory once it is collected
  const cueRender = Float32Array.from((await engineContext.startRendering()).getChannelData(0))
  engine.destroy()

  const oracleContext = new Offline(1, length, ORACLE_RATE)
  playOracle(oracleContext, cue, when)
  const oracleRender = Float32Array.from((await oracleContext.startRendering()).getChannelData(0))

  return { cue: cueRender, oracle: oracleRender }
}

export interface Difference {
  /** The largest absolute sample difference from the cue's start on. */
  largest: number
  /** Where it falls, in seconds after the cue's start. */
  at: number
  /** The oracle's own peak over the same span, so a silent pair cannot pass. */
  oraclePeak: number
}

/** Compare two renders sample by sample, from the cue's start at `when` on. */
export function differenceFrom(a: Float32Array, b: Float32Array, when: number): Difference {
  const from = Math.round(when * ORACLE_RATE)
  let largest = 0
  let at = 0
  let oraclePeak = 0
  for (let i = from; i < Math.max(a.length, b.length); i++) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0))
    if (d > largest) {
      largest = d
      at = (i - from) / ORACLE_RATE
    }
    oraclePeak = Math.max(oraclePeak, Math.abs(b[i] ?? 0))
  }
  return { largest, at, oraclePeak }
}
