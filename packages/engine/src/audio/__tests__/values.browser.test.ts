import { describe, expect, it } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import { builtInPresets } from '../../presets'
import type { SoundscapeState } from '../../types'
import { SoundscapeValueError } from '../../utils/values'

/**
 * A note a game sends while the music plays, holding values that cannot
 * play, in a real browser: Rock Paper Scissors' ending-broken, whose three
 * notes pass previewNote a decay above 1. Each plays nothing, is reported
 * once through the page's own reportError, as an error event on the window,
 * and the call returns to the game.
 */
const RATE = 48000

const state: SoundscapeState = {
  metadata: { name: 'Ending', tempo: 60, timeSignature: [4, 4], lengthBeats: 4 },
  presets: [...builtInPresets],
  tracks: [],
  mixer: { tracks: {}, masterVolume: 0.7 },
}

/**
 * The page's error events while `run` runs. Listening for them is also what
 * keeps the test runner from failing on a reported error, as it would on one
 * thrown and never caught; it may still log each.
 */
async function reportedWhile<T>(run: () => Promise<T>): Promise<{ result: T; reported: unknown[] }> {
  const reported: unknown[] = []
  const take = (e: ErrorEvent) => {
    reported.push(e.error)
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  window.addEventListener('error', take, { capture: true })
  try {
    return { result: await run(), reported }
  } finally {
    window.removeEventListener('error', take, { capture: true })
  }
}

/** The loudest sample of a second rendered after `play`. */
async function peakAfter(play: (engine: AudioEngine) => void): Promise<number> {
  const ctx = new OfflineAudioContext(2, RATE, RATE)
  const engine = new AudioEngine({ context: ctx })
  await engine.initialize()
  engine.updateState(state)
  play(engine)
  const out = await ctx.startRendering()
  let peak = 0
  for (let c = 0; c < out.numberOfChannels; c++) {
    for (const x of out.getChannelData(c)) peak = Math.max(peak, Math.abs(x))
  }
  return peak
}

describe("Rock Paper Scissors' ending-broken, through previewNote, in this browser", () => {
  it('plays nothing, reports each note once through reportError, and returns to the game', async () => {
    const { result: peak, reported } = await reportedWhile(() =>
      peakAfter((engine) => {
        // The ending's three calls, as the game's musicManager.ts makes them
        engine.previewNote(48, 100, 'bass', { distortion: 0.4, filterCutoff: 0.3, attack: 0.01, decay: 1.5, sustain: 0.1, release: 1.0 })
        engine.previewNote(36, 110, 'percussion', { distortion: 0.5, attack: 0.1, decay: 2.0, sustain: 0.05, release: 1.5 })
        engine.previewNote(24, 90, 'bass', { filterCutoff: 0.15, attack: 0.3, decay: 2.5, sustain: 0, release: 2.0 })
      })
    )
    expect(peak).toBe(0)
    expect(reported).toHaveLength(3)
    for (const e of reported) expect(e).toBeInstanceOf(SoundscapeValueError)
    expect(String(reported[0])).toContain('paramOverrides.decay: must be from 0 to 1, got 1.5')
  })

  it('plays the same notes with values that can play, reporting nothing', async () => {
    const { result: peak, reported } = await reportedWhile(() =>
      peakAfter((engine) => {
        engine.previewNote(48, 100, 'bass', { distortion: 0.4, filterCutoff: 0.3, attack: 0.01, decay: 1, sustain: 0.1, release: 1.0 })
      })
    )
    expect(peak).toBeGreaterThan(0.01)
    expect(reported).toEqual([])
  })
})
