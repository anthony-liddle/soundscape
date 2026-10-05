import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { builtInPresets } from '../../presets'
import { createMixerState, createNote, createTrack, defaultInstrumentParams, defaultMetadata } from '../../types'
import type { InstrumentParams, SoundscapeState, Track } from '../../types'
import {
  SAMPLE_RATE,
  START,
  decodeWav,
  encodeWav,
  installOfflineAudioContext,
  largestDifference,
  renderInLockstep,
  seedRandom,
  useLockstepTimers,
} from './renderHarness'

/**
 * Nothing that existed before cues sounds any different after them.
 *
 * Each case renders existing behaviour offline, through the same calls a
 * consumer makes, and is compared sample by sample with a reference recorded
 * before cues touched the engine:
 *
 *   the transport playing a short looping composition through five built-in
 *   presets, covering distortion, delay, reverb, unison and an LFO override;
 *   previewNote, including the bass-with-distortion call rock-paper-scissors
 *   makes for a sound effect;
 *   the three voice configurations render.test.ts uses.
 *
 * The engine builds its own AudioContext, so a constructor that makes an
 * offline one stands in for it: this is the default path every consumer takes.
 *
 * TOLERANCE: renders on the machine that recorded the references were
 * bit-identical across repeated runs. The allowance is for other platforms,
 * where node-web-audio-api's floating-point arithmetic may round differently.
 * It is 1e-6, about -120 dBFS; a change to any default moves samples by orders
 * of magnitude more.
 *
 * To record the references again, run with UPDATE_RENDER_REFERENCE=1. Only do
 * that for a change that is meant to be heard.
 */
const TOLERANCE = 1e-6
const DIR = resolve(__dirname, 'reference/existing')
const UPDATE = process.env.UPDATE_RENDER_REFERENCE === '1'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function track(id: string, presetId: string, notes: [number, number, number][], overrides?: Partial<InstrumentParams>): Track {
  const t = { ...createTrack(id, presetId), id }
  if (overrides) t.paramOverrides = overrides
  // createNote ids are random; the notes are given fixed ids so a render does
  // not depend on them.
  t.notes = notes.map(([pitch, start, duration], i) => ({
    ...createNote(pitch, start, duration, 100),
    id: `${id}-${i}`,
  }))
  return t
}

function composition(): SoundscapeState {
  return {
    metadata: { ...defaultMetadata, name: 'Guard', tempo: 120, lengthBeats: 4 },
    presets: [...builtInPresets],
    mixer: createMixerState(),
    tracks: [
      track('bass', 'bass', [[36, 0, 1], [43, 2, 1.5]]),
      track('lead', 'lead', [[72, 0, 0.5], [74, 0.5, 0.5], [76, 1, 1], [79, 3, 0.75]]),
      track('pad', 'pad', [[60, 0, 4], [64, 0, 4], [67, 0, 4]]),
      track('percussion', 'percussion', [[36, 0, 0.25], [36, 1, 0.25], [36, 2, 0.25], [36, 3, 0.25]]),
      track('keys', 'keys', [[67, 1, 1], [69, 3, 0.5]], { lfoDepth: 0.3, lfoTarget: 'pitch', lfoRate: 0.5 }),
    ],
  }
}

/** Render through AudioEngine, the way a consumer drives it, with `act` at START. */
async function renderEngine(
  seconds: number,
  setup: (engine: AudioEngine) => void,
  act: (engine: AudioEngine) => void
): Promise<Float32Array> {
  seedRandom()
  useLockstepTimers()
  const context = installOfflineAudioContext(seconds)
  const engine = new AudioEngine()
  await engine.initialize()
  setup(engine)
  const samples = await renderInLockstep(context(), new Map([[START, () => act(engine)]]))
  engine.stop()
  return samples
}

/** Render one voice the way render.test.ts does, starting at START. */
async function renderVoice(
  params: InstrumentParams,
  { pitch = 69, velocity = 127, noteOffAfter = null as number | null, seconds = 0.6 } = {}
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE)
  const voice = new VoiceSynthesizer(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode)
  voice.noteOn({ pitch, velocity, instrument: params }, START)
  if (noteOffAfter !== null) voice.noteOff(params, START + noteOffAfter)
  const buffer = await ctx.startRendering()
  voice.stop()
  return buffer.getChannelData(0)
}

const params = (overrides: Partial<InstrumentParams>): InstrumentParams => ({ ...defaultInstrumentParams, ...overrides })

const CASES: [string, () => Promise<Float32Array>][] = [
  [
    'transport-composition',
    () => renderEngine(3.2, (e) => e.updateState(composition()), (e) => e.play()),
  ],
  [
    'preview-keys',
    () =>
      renderEngine(
        1.6,
        (e) => e.updateState({ ...composition(), tracks: [] }),
        (e) => e.previewNote(60, 100, 'keys')
      ),
  ],
  [
    'preview-bass-distortion',
    () =>
      renderEngine(
        1.6,
        (e) => e.updateState({ ...composition(), tracks: [] }),
        (e) => e.previewNote(50, 127, 'bass', { distortion: 0.6 })
      ),
  ],
  ['voice-sine', () => renderVoice(params({ waveform: 'sine', attack: 0, lfoDepth: 0 }))],
  ['voice-velocity-zero', () => renderVoice(params({ waveform: 'sine', velocityResponse: 1 }), { velocity: 0 })],
  [
    'voice-release',
    () => renderVoice(params({ waveform: 'sine', release: 0.1, lfoDepth: 0 }), { noteOffAfter: 0.2, seconds: 1.2 }),
  ],
]

describe('existing behaviour renders exactly as before cues', () => {
  for (const [name, render] of CASES) {
    it(name, { timeout: 60_000 }, async () => {
      const samples = await render()
      const file = resolve(DIR, `${name}.wav`)
      if (UPDATE) {
        writeFileSync(file, encodeWav(samples))
        return
      }
      const reference = decodeWav(readFileSync(file))
      expect(samples.length).toBe(reference.length)
      expect(largestDifference(samples, reference)).toBeLessThanOrEqual(TOLERANCE)
    })
  }
})
