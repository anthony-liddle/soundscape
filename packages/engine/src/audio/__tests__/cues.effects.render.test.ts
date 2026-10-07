import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { EffectsChain } from '../EffectsChain'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import type { CueDocument, CueInstrument, CueNote } from '../../cues/types'
import { SAMPLE_RATE, START, decodeWav, encodeWav, largestDifference } from './renderHarness'

/**
 * A cue instrument with no effect plays straight into the cue output, with no
 * effects chain, and one with any effect keeps its chain, less the convolver
 * no cue can hear.
 *
 * The cues with no effect and with delay are compared sample by sample with
 * references rendered in node-web-audio-api before the change, when every cue
 * instrument had a chain, with the distortion curve centred as #110 centres
 * it: reference/effects/provenance.json says which commit, and how.
 * So an instrument with no effect sounds the same without its chain as it did
 * through one, and an instrument with delay sounds as it did. Reverb is not
 * here: a cue instrument's reverbMix must be 0, so no cue can ask for it.
 *
 * The cue through distortion is compared instead with the same note through a
 * chain built the old way, with every send, rendered in the same run. Its
 * waveshaper oversamples, and the resampling filters round differently by
 * processor: against a reference recorded on macOS arm64 it landed 1.2e-6 away
 * on Linux x64, where the voice going in differed by at most 3e-8 and the
 * curve with no oversampling by 1.2e-7. In the same run, both sides round the
 * same, so it is held to 1e-6 like the rest.
 *
 * TOLERANCE: 1e-6, about -120 dBFS, as the other render tests. The references
 * were bit-identical across repeated runs on the machine that recorded them,
 * and taking the delay away from its cue moves it by 0.13.
 *
 * To record the references again, run with UPDATE_RENDER_REFERENCE=1. Only do
 * that for a change that is meant to be heard.
 */
const TOLERANCE = 1e-6
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
    it(`is built for an instrument with an effect, without the convolver no cue can hear: ${name}`, async () => {
      expect(await effectNodesFor({ [name]: DOCUMENT.instruments[name]! })).toEqual({
        convolver: 0,
        waveshaper: 1,
        delay: 1,
      })
    })
  }
})

async function render(document: CueDocument, name: string): Promise<Float32Array> {
  const { ctx, engine } = await engineOn()
  engine.loadCues(document)
  engine.playCue(name, START)
  return Float32Array.from((await ctx.startRendering()).getChannelData(0))
}

/**
 * A cue's notes through a chain built as loadCues built every cue chain before
 * #109: every send, the convolver included, and the cue's effects set on it.
 */
async function renderTheOldWay(name: string): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round(SECONDS * SAMPLE_RATE), SAMPLE_RATE)
  const context = ctx as unknown as BaseAudioContext
  const chain = new EffectsChain(context, { oversampleOnlyWhenDistorting: true })
  const notes = DOCUMENT.cues[name]!.notes
  const instrument = DOCUMENT.instruments[notes[0]!.instrument]!
  chain.setParams({
    delayTime: instrument.delayTime,
    delayFeedback: instrument.delayFeedback,
    delayMix: instrument.delayMix,
    distortion: instrument.distortion,
    reverbMix: instrument.reverbMix,
  })
  chain.getOutput().connect(ctx.destination as unknown as AudioNode)
  for (const n of notes) {
    const voice = new VoiceSynthesizer(context, chain.getInput())
    voice.playNote({ pitch: n.pitch, velocity: 127, instrument, peak: n.level, setAsValues: true }, START + n.start, n.duration)
  }
  return Float32Array.from((await ctx.startRendering()).getChannelData(0))
}

describe('the distortion cue sounds as it did when every chain had every send', () => {
  it('grit, against a chain built the old way in the same run', async () => {
    const oldWay = await renderTheOldWay('grit')
    expect(largestDifference(await render(DOCUMENT, 'grit'), oldWay, 0)).toBeLessThan(TOLERANCE)
    // The distortion is in what it is held to: without it the note differs
    const clean = { ...DOCUMENT, instruments: { ...DOCUMENT.instruments, grit: { ...DOCUMENT.instruments.grit!, distortion: 0 } } }
    expect(largestDifference(await render(clean, 'grit'), oldWay, 0)).toBeGreaterThan(0.01)
  })
})

describe('a cue sounds as it did when every instrument had a chain', () => {
  for (const name of Object.keys(DOCUMENT.cues).filter((cue) => cue !== 'grit')) {
    it(name, async () => {
      const rendered = await render(DOCUMENT, name)
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
