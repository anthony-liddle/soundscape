import { describe, expect, it } from 'vitest'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'

/**
 * A song note, played by the transport's path, noteOn, in a real browser,
 * against the same note played the way a cue plays it, playNote with its
 * settings as values, which the browsers agree on sample for sample.
 *
 * In Chromium, an oscillator whose frequency is an automation event at a start
 * inside a render quantum begins with a different phase from one whose
 * frequency is a value, so a song note did not start as it does in WebKit. A
 * song note's oscillators are made for it alone, so the voice sets their
 * frequency and detune as values.
 */
const RATE = 48000
// 37.3 frames into a render quantum, past the first quanta every renderer settles in
const START = (100 * 128 + 37.3) / RATE
const TOLERANCE = 1e-6

const instrument: InstrumentParams = {
  ...defaultInstrumentParams,
  waveform: 'sawtooth',
  attack: 0.05,
  decay: 0.3,
  sustain: 0.6,
  release: 0.2,
  filterType: 'none',
  unisonDetune: 0.3,
  lfoDepth: 0,
  velocityResponse: 0,
}

async function render(play: (voice: VoiceSynthesizer) => void): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round((START + 0.4) * RATE), RATE)
  const voice = new VoiceSynthesizer(ctx, ctx.destination)
  play(voice)
  return (await ctx.startRendering()).getChannelData(0)
}

describe('a song note in this browser', () => {
  it('starts as the same note does played as a cue, mid-quantum, in unison', async () => {
    // Both hold the same envelope until the render ends, before any release
    const song = await render((v) => v.noteOn({ pitch: 57, velocity: 127, instrument }, START))
    const cue = await render((v) => v.playNote({ pitch: 57, velocity: 127, instrument, setAsValues: true }, START, 1))
    let largest = 0
    let peak = 0
    for (let i = Math.floor(START * RATE); i < song.length; i++) {
      largest = Math.max(largest, Math.abs(song[i]! - cue[i]!))
      peak = Math.max(peak, Math.abs(cue[i]!))
    }
    expect(peak).toBeGreaterThan(0.1)
    expect(largest).toBeLessThan(TOLERANCE)
  })
})
