import { describe, expect, it } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import type { EffectsChain } from '../EffectsChain'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { builtInPresets } from '../../presets'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams, SoundscapeState } from '../../types'

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

describe('a track with no distortion, in this browser', () => {
  // WebKit oversamples a waveshaper with no curve, delaying the signal 6
  // samples at 2x and filtering it. The engine builds a track's chain so a
  // track with no distortion passes its notes through untouched.
  const state: SoundscapeState = {
    metadata: { name: 'Track', tempo: 120, timeSignature: [4, 4], lengthBeats: 4 },
    presets: [...builtInPresets],
    tracks: [{ id: 'pad', name: 'Pad', presetId: 'pad', notes: [], paramOverrides: { distortion: 0, delayMix: 0, reverbMix: 0 } }],
    mixer: { tracks: { pad: { volume: 1, mute: false, solo: false } }, masterVolume: 1 },
  }

  /** A sawtooth straight to the output, or through the chain the engine builds for the track. */
  async function render(throughTheTrack: boolean): Promise<Float32Array> {
    const ctx = new OfflineAudioContext(1, Math.round((START + 0.3) * RATE), RATE)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 220
    if (throughTheTrack) {
      const engine = new AudioEngine({ context: ctx })
      await engine.initialize()
      engine.updateState(state)
      const chain = (engine as unknown as { trackChannels: Map<string, { effectsChain: EffectsChain }> }).trackChannels.get('pad')!
        .effectsChain
      chain.getOutput().disconnect()
      chain.getOutput().connect(ctx.destination)
      osc.connect(chain.getInput())
    } else {
      osc.connect(ctx.destination)
    }
    osc.start(START)
    osc.stop(START + 0.2)
    return (await ctx.startRendering()).getChannelData(0)
  }

  it('passes its notes through untouched, not delayed or filtered by oversampling', async () => {
    const track = await render(true)
    const dry = await render(false)
    let largest = 0
    let peak = 0
    for (let i = Math.floor(START * RATE); i < dry.length; i++) {
      largest = Math.max(largest, Math.abs(track[i]! - dry[i]!))
      peak = Math.max(peak, Math.abs(dry[i]!))
    }
    expect(peak).toBeGreaterThan(0.1)
    expect(largest).toBeLessThan(TOLERANCE)
  })
})
