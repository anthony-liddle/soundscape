import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import type { CueDocument, CueInstrument, CueNote } from '../../cues/types'
import { SAMPLE_RATE, START, decodeWav, encodeWav, largestDifference } from './renderHarness'

/**
 * A cue instrument with no effect plays straight into the cue output, with no
 * effects chain, and one with any effect keeps its whole chain.
 *
 * Each cue here is compared sample by sample with a reference rendered in
 * node-web-audio-api before the change, when every cue instrument had a chain:
 * reference/effects/provenance.json says which commit. So an instrument with no
 * effect sounds the same without its chain as it did through one, and an
 * instrument with delay or distortion sounds as it did. Reverb is not here: a
 * cue instrument's reverbMix must be 0, so no cue can ask for it.
 *
 * TOLERANCE: the references were bit-identical across repeated runs on the
 * machine that recorded them, macOS on arm64. On Linux x64 in CI the
 * distortion cue, which goes through the waveshaper's curve, lands 1.2e-6
 * away, so the allowance is 1e-5, about -100 dBFS. Taking the delay away
 * from its cue moves it by 0.13.
 *
 * To record the references again, run with UPDATE_RENDER_REFERENCE=1. Only do
 * that for a change that is meant to be heard.
 */
const TOLERANCE = 1e-5
const DIR = resolve(__dirname, 'reference/effects')
const UPDATE = process.env.UPDATE_RENDER_REFERENCE === '1'
const SECONDS = 1.5

afterEach(() => {
  vi.restoreAllMocks()
})

const sine = (overrides: Partial<CueInstrument> = {}): CueInstrument => ({
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0.074,
  decay: 0.2,
  sustain: 0,
  release: 0,
  envelopeCurve: 'exponential',
  envelopeFloor: 1e-4,
  filterType: 'none',
  filterCutoff: 1,
  filterResonance: 0,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  reverbMix: 0,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  unisonDetune: 0,
  velocityResponse: 0,
  ...overrides,
})

const note = (id: string, instrument: string, pitch: number, start: number): CueNote => ({
  id,
  instrument,
  start,
  duration: 0.15,
  pitch,
  level: 0.4,
})

const DOCUMENT: CueDocument = {
  format: 'soundscape-cues',
  version: 1,
  instruments: {
    plain: sine(),
    echo: sine({ delayTime: 0.25, delayFeedback: 0.5, delayMix: 0.35 }),
    grit: sine({ waveform: 'sawtooth', distortion: 0.6 }),
  },
  cues: {
    plain: { notes: [note('plain-1', 'plain', 67, 0), note('plain-2', 'plain', 71, 0.06)] },
    echo: { notes: [note('echo-1', 'echo', 64, 0)] },
    grit: { notes: [note('grit-1', 'grit', 45, 0)] },
    // An instrument with no chain and one with a chain, sounding together
    both: { notes: [note('both-1', 'plain', 72, 0), note('both-2', 'echo', 60, 0.03)] },
  },
}

async function engineOn() {
  const ctx = new OfflineAudioContext(1, Math.round(SECONDS * SAMPLE_RATE), SAMPLE_RATE)
  const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
  await engine.initialize()
  return { ctx, engine }
}

/** How many of each effect node loading `instruments` as cues creates. */
async function effectNodesFor(instruments: Record<string, CueInstrument>) {
  const { ctx, engine } = await engineOn()
  const convolver = vi.spyOn(ctx, 'createConvolver')
  const waveshaper = vi.spyOn(ctx, 'createWaveShaper')
  const delay = vi.spyOn(ctx, 'createDelay')
  const name = Object.keys(instruments)[0]!
  engine.loadCues({ ...DOCUMENT, instruments, cues: { one: { notes: [note('one-1', name, 60, 0)] } } })
  engine.playCue('one', START)
  return {
    convolver: convolver.mock.calls.length,
    waveshaper: waveshaper.mock.calls.length,
    delay: delay.mock.calls.length,
  }
}

describe("a cue instrument's effects chain", () => {
  it('is not built when every effect is zero: no convolver, waveshaper or delay', async () => {
    expect(await effectNodesFor({ plain: DOCUMENT.instruments.plain! })).toEqual({
      convolver: 0,
      waveshaper: 0,
      delay: 0,
    })
  })

  for (const name of ['echo', 'grit']) {
    it(`is built whole for an instrument with an effect: ${name}`, async () => {
      expect(await effectNodesFor({ [name]: DOCUMENT.instruments[name]! })).toEqual({
        convolver: 1,
        waveshaper: 1,
        delay: 1,
      })
    })
  }
})

describe('a cue sounds as it did when every instrument had a chain', () => {
  for (const name of Object.keys(DOCUMENT.cues)) {
    it(name, async () => {
      const { ctx, engine } = await engineOn()
      engine.loadCues(DOCUMENT)
      engine.playCue(name, START)
      const rendered = Float32Array.from((await ctx.startRendering()).getChannelData(0))
      const file = resolve(DIR, `${name}.wav`)
      if (UPDATE) writeFileSync(file, encodeWav(rendered))
      const reference = decodeWav(readFileSync(file))
      expect(largestDifference(rendered, reference, 0)).toBeLessThan(TOLERANCE)
      // The effect is in the reference: the cue sounds well past its last note
      if (name === 'echo' || name === 'both') {
        const after = reference.subarray(Math.round((START + 0.5) * SAMPLE_RATE))
        expect(after.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0)).toBeGreaterThan(0.01)
      }
    })
  }
})
