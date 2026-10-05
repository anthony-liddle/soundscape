import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { CueDocumentError } from '../../cues/types'
import type { CueDocument, CueInstrument, CueNote } from '../../cues/types'
import { builtInPresets } from '../../presets'
import { createMixerState, defaultMetadata } from '../../types'
import {
  SAMPLE_RATE,
  START,
  decodeWav,
  installOfflineAudioContext,
  largestDifference,
  renderInLockstep,
  retryRefused,
  seedRandom,
  useLockstepTimers,
} from './renderHarness'

/**
 * Playing cues, rendered offline in node-web-audio-api through the engine's
 * own calls: loadCues, then playCue at an audio-clock time.
 */
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
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

const note = (id: string, pitch: number, start: number, overrides: Partial<CueNote> = {}): CueNote => ({
  id,
  instrument: 'sine',
  start,
  duration: 0.15,
  pitch,
  level: 0.4,
  ...overrides,
})

function doc(cues: Record<string, CueNote[]>, instrument = sine()): CueDocument {
  return {
    format: 'soundscape-cues',
    version: 1,
    instruments: { sine: instrument },
    cues: Object.fromEntries(Object.entries(cues).map(([name, notes]) => [name, { notes }])),
  }
}

const PAIR = doc({
  pair: [note('g', 55, 0), note('f', 53, 0.08)],
  g: [note('g1', 55, 0)],
  f: [note('f1', 53, 0.08)],
})

async function engineWith(channels = 1, seconds = 0.8) {
  const ctx = new OfflineAudioContext(channels, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE)
  const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
  await engine.initialize()
  return { ctx, engine }
}

async function render(play: (engine: AudioEngine) => void, cues: CueDocument = PAIR, channels = 1) {
  const { ctx, engine } = await engineWith(channels)
  engine.loadCues(cues)
  play(engine)
  const buffer = await ctx.startRendering()
  return Float32Array.from(buffer.getChannelData(0))
}

const sum = (a: Float32Array, b: Float32Array) => a.map((v, i) => v + b[i]!)
const peakIn = (x: Float32Array, from: number, to: number) => {
  let p = 0
  for (let i = Math.round(from * SAMPLE_RATE); i < Math.round(to * SAMPLE_RATE); i++) p = Math.max(p, Math.abs(x[i]!))
  return p
}

describe('playCue', () => {
  it('renders offline, where it was scheduled and nowhere before', async () => {
    const x = await render((e) => e.playCue('g', START))
    expect(peakIn(x, 0, START)).toBe(0)
    expect(peakIn(x, START, START + 0.05)).toBeGreaterThan(0.3)
  })

  it('needs no timer to sound: with the clock frozen, the render is the same', async () => {
    const free = await render((e) => e.playCue('pair', START))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const frozen = await render((e) => e.playCue('pair', START))
    expect(largestDifference(frozen, free)).toBe(0)
  })

  it('gives every note its own voice: two overlapping notes sum exactly', async () => {
    const pair = await render((e) => e.playCue('pair', START))
    const apart = sum(await render((e) => e.playCue('g', START)), await render((e) => e.playCue('f', START)))
    expect(peakIn(pair, START + 0.08, START + 0.1)).toBeGreaterThan(0.1)
    expect(largestDifference(pair, apart)).toBeLessThan(1e-7)
  })

  it('lets cues overlap: a second cue fired while the first rings does not cut it off', async () => {
    const both = await render((e) => {
      e.playCue('pair', START)
      e.playCue('pair', START + 0.05)
    })
    const apart = sum(
      await render((e) => e.playCue('pair', START)),
      await render((e) => e.playCue('pair', START + 0.05))
    )
    expect(largestDifference(both, apart)).toBeLessThan(1e-7)
  })

  it('lands each note at its level: no master gain, no compressor, no ceiling', async () => {
    const steady = doc({ hold: [note('h', 69, 0, { duration: 0.4, level: 0.5 })] }, sine({ envelopeCurve: 'linear', envelopeFloor: undefined, sustain: 1, attack: 0 }))
    delete (steady.instruments.sine as Partial<CueInstrument>).envelopeFloor
    const x = await render((e) => e.playCue('hold', START), steady)
    expect(peakIn(x, START + 0.1, START + 0.3)).toBeCloseTo(0.5, 3)
  })

  it('follows its own volume and mute', async () => {
    const full = await render((e) => e.playCue('g', START))
    const half = await render((e) => {
      e.setCueVolume(0.5)
      e.playCue('g', START)
    })
    const muted = await render((e) => {
      e.setCuesMuted(true)
      e.playCue('g', START)
    })
    expect(largestDifference(half, full.map((v) => v * 0.5))).toBeLessThan(1e-7)
    expect(peakIn(muted, 0, 0.8)).toBe(0)
  })

  it('plays out a ringing cue when the document is replaced under it', async () => {
    const kept = await render((e) => {
      e.playCue('pair', START)
      e.loadCues(doc({ other: [note('o', 60, 0)] }))
    })
    const plain = await render((e) => e.playCue('pair', START))
    expect(largestDifference(kept, plain)).toBe(0)
  })

  it('says what is wrong when it cannot play', async () => {
    const { engine } = await engineWith()
    expect(() => engine.playCue('g')).toThrow(/loadCues/)
    engine.loadCues(PAIR)
    expect(() => engine.playCue('missing')).toThrow(/No cue named "missing"/)
    expect(() => engine.playCue('toString')).toThrow(/No cue named "toString"/)
    expect(() => engine.loadCues({ ...PAIR, version: 2 })).toThrow(CueDocumentError)
  })
})

describe('the analyser', () => {
  for (const channels of [1, 2]) {
    it(`passes cues through unchanged, in ${channels === 1 ? 'mono' : 'stereo'}`, async () => {
      const viaAnalyser = await render((e) => e.playCue('pair', START), PAIR, channels)
      const direct = await render(
        (e) => {
          // Route the cue bus straight to the destination instead
          const inner = e as unknown as { cueBus: GainNode; context: BaseAudioContext }
          inner.cueBus.disconnect()
          inner.cueBus.connect(inner.context.destination)
          e.playCue('pair', START)
        },
        PAIR,
        channels
      )
      expect(peakIn(viaAnalyser, START, START + 0.2)).toBeGreaterThan(0.1)
      expect(largestDifference(viaAnalyser, direct)).toBe(0)
    })
  }
})

describe('loading cues leaves music alone', () => {
  it('previewNote renders exactly its pre-cue reference with a cue document loaded', async () => {
    const samples = await retryRefused(async () => {
      seedRandom()
      useLockstepTimers()
      const context = installOfflineAudioContext(1.6)
      const engine = new AudioEngine()
      await engine.initialize()
      engine.updateState({
        metadata: { ...defaultMetadata, name: 'Guard', tempo: 120, lengthBeats: 4 },
        presets: [...builtInPresets],
        mixer: createMixerState(),
        tracks: [],
      })
      engine.loadCues(PAIR)
      return renderInLockstep(context(), new Map([[START, () => engine.previewNote(60, 100, 'keys')]]))
    })
    const reference = decodeWav(readFileSync(resolve(__dirname, 'reference/existing/preview-keys.wav')))
    expect(largestDifference(samples, reference)).toBe(0)
  })
})
