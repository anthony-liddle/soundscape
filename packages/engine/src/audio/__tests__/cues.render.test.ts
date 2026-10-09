import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { EffectsChain, delayTail } from '../EffectsChain'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { createMockAudioContext } from './mockWebAudio'
import type { MockAudioContext, MockNode } from './mockWebAudio'
import { midiToFrequency } from '../../utils/pitch'
import { CueDocumentError } from '../../cues/types'
import type { CueDocument, CueInstrument, CueNote } from '../../cues/types'
import { builtInPresets } from '../../presets'
import { createMixerState, defaultMetadata } from '../../types'
import {
  SAMPLE_RATE,
  START,
  LockstepRefused,
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

/** One short note through a delay, and a document to replace it with. */
const ECHO = doc({ g: [note('g1', 55, 0)] }, sine({ delayTime: 0.1, delayFeedback: 0.5, delayMix: 0.4 }))
const OTHER = doc({ other: [note('o', 60, 0)] })

/** After ECHO's note has stopped, at START + 0.17 s, and while its echoes ring. */
const ENDS_REPORTED_AT = 0.4

/**
 * Render with every voice's end reported to the engine when the test says,
 * not when node-web-audio-api delivers it. It usually delivers one after the
 * render has finished, but once delivered one first, and only then were a
 * replaced cue's echoes cut (#123). Each end is held, then reported at a
 * suspension at ENDS_REPORTED_AT, after every note has stopped, or once the
 * render has finished: both times a renderer may report it. `atSuspension`
 * runs at the suspension, after the ends are reported.
 */
async function renderReportingEnds(
  reported: 'mid-render' | 'after the render',
  cues: CueDocument,
  play: (engine: AudioEngine) => void,
  atSuspension?: (engine: AudioEngine) => void
): Promise<Float32Array> {
  return retryRefused(async () => {
    const { ctx, engine } = await engineWith()
    const held: Array<() => void> = []
    const createOscillator = ctx.createOscillator.bind(ctx)
    ctx.createOscillator = () => {
      const osc = createOscillator()
      Object.defineProperty(osc, 'onended', { set: (report: () => void) => held.push(report) })
      return osc
    }
    const reportEnds = () => {
      for (const report of held.splice(0)) report()
    }
    engine.loadCues(cues)
    play(engine)
    let refused: unknown = null
    if (reported === 'mid-render') {
      ctx.suspend(ENDS_REPORTED_AT).then(
        () => {
          reportEnds()
          atSuspension?.(engine)
          void ctx.resume()
        },
        (error: unknown) => {
          refused = error
        }
      )
    }
    const buffer = await ctx.startRendering()
    if (refused !== null) {
      throw new LockstepRefused([`frame ${Math.round(ENDS_REPORTED_AT * SAMPLE_RATE)} of ${ctx.length}: ${String(refused)}`])
    }
    reportEnds()
    return Float32Array.from(buffer.getChannelData(0))
  })
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

  for (const reported of ['mid-render', 'after the render'] as const) {
    it(`plays out a ringing cue through its effects chain when the document is replaced under it, its note's end reported ${reported}`, async () => {
      const kept = await renderReportingEnds(reported, ECHO, (e) => {
        e.playCue('g', START)
        e.loadCues(OTHER)
      })
      const plain = await render((e) => e.playCue('g', START), ECHO)
      // Reporting the end where the test says changes nothing by itself
      expect(largestDifference(await renderReportingEnds(reported, ECHO, (e) => e.playCue('g', START)), plain)).toBe(0)
      // The echoes are there, and the same as if the document had stayed
      expect(peakIn(plain, ENDS_REPORTED_AT, ENDS_REPORTED_AT + 0.15)).toBeGreaterThan(0.01)
      expect(largestDifference(kept, plain)).toBe(0)
    })
  }

  it('plays out a ringing cue through its effects chain when the document is replaced after its note has ended', async () => {
    const kept = await renderReportingEnds(
      'mid-render',
      ECHO,
      (e) => e.playCue('g', START),
      (e) => e.loadCues(OTHER)
    )
    const plain = await render((e) => e.playCue('g', START), ECHO)
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

describe('the engine keeps its own copy of a loaded document', () => {
  it('plays a cue as loaded after the document is changed', async () => {
    const asLoaded = await render((e) => e.playCue('g', START), doc({ g: [note('g1', 55, 0)] }))
    const edited = doc({ g: [note('g1', 55, 0)] })
    const after = await render((e) => {
      // An editor changing the document it loaded: an envelope and a pitch
      edited.instruments.sine!.attack = 0.5
      edited.cues.g!.notes[0]!.pitch = 67
      e.playCue('g', START)
    }, edited)
    expect(largestDifference(after, asLoaded)).toBe(0)
  })

  it('keeps the cues it loaded when cues are added to or removed from the document', async () => {
    const edited = doc({ g: [note('g1', 55, 0)] })
    const { engine } = await engineWith()
    engine.loadCues(edited)
    delete edited.cues.g
    edited.cues.added = { notes: [note('a1', 60, 0)] }
    expect(engine.getCueNames()).toEqual(['g'])
    expect(() => engine.playCue('g', START)).not.toThrow()
    expect(() => engine.playCue('added', START)).toThrow(/No cue named "added"/)
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
  const preview = (withCues: boolean) =>
    retryRefused(async () => {
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
      if (withCues) engine.loadCues(PAIR)
      return renderInLockstep(context(), new Map([[START, () => engine.previewNote(60, 100, 'keys')]]))
    })

  it('previewNote renders identically with a cue document loaded', async () => {
    // Both renders come from this machine, so they can be held to exactly
    // zero; the reference WAVs were recorded on macOS, and Linux renders the
    // same graph up to 4.5e-8 away from them. The existing-behaviour guard
    // holds the render without cues to that reference, within its tolerance.
    const without = await preview(false)
    const withCues = await preview(true)
    expect(peakIn(without, START, START + 0.5)).toBeGreaterThan(0.01)
    expect(largestDifference(withCues, without)).toBe(0)
  })
})

describe("a cue note's settings are values, not events at its start", () => {
  // In Chrome 154, an oscillator whose frequency is an automation event at a
  // start that falls inside a render quantum begins with a different phase
  // from one whose frequency is a value: a 0.5 sine started 96 frames into a
  // quantum differed by up to 0.998. Hand-built cues set values, so a cue's
  // single-note voices do too, and match them in Chrome as well.
  it('sets a cue note frequency as a value, with no event', async () => {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    engine.loadCues(PAIR)
    engine.playCue('g', 0.09)
    const oscillators = ctx.createdNodes.filter((n) => n.kind === 'oscillator')
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0]!.frequency.value).toBe(midiToFrequency(55))
    expect(oscillators[0]!.frequency.setValueAtTime).not.toHaveBeenCalled()
  })

  it('leaves a music note with the event it has always had', () => {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode)
    voice.noteOn({ pitch: 55, velocity: 100, instrument: PAIR.instruments.sine! }, 0.09)
    const oscillator = ctx.createdNodes.find((n) => n.kind === 'oscillator')!
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(midiToFrequency(55), 0.09)
  })
})

describe('a cue never cancels a scheduled value', () => {
  // Firefox has no cancelAndHoldAtTime, and cancels a ramp that ends up to half
  // a sample before the cancel time, which is how its notes lost their decay.
  // A cue that never cancels cannot depend on either.
  it('calls no cancel on any param, through loadCues, playCue and every voice ending', async () => {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    const before = ctx.createdNodes.length
    engine.loadCues(PAIR)
    engine.playCue('pair', 0.128)
    engine.playCue('pair', 9.749333333333333)
    const nodes = ctx.createdNodes.slice(before)
    const oscillators = nodes.filter((n) => n.kind === 'oscillator')
    expect(oscillators).toHaveLength(4)
    for (const osc of oscillators) (osc as unknown as { onended: () => void }).onended()
    for (const node of nodes) {
      for (const param of [node.gain, node.frequency, node.detune, node.Q, node.delayTime]) {
        expect(param.cancelScheduledValues).not.toHaveBeenCalled()
        expect(param.cancelAndHoldAtTime).not.toHaveBeenCalled()
      }
    }
    // and the ended voices were released from the graph
    for (const osc of oscillators) expect(osc.disconnect).toHaveBeenCalled()
  })
})

describe('a replaced cue chain', () => {
  // Mocked, so every source's end is reported exactly when the test says
  async function mocked() {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    const disconnect = vi.spyOn(EffectsChain.prototype, 'disconnect')
    return { ctx, engine, disconnect }
  }
  const made = (ctx: MockAudioContext, kind: string) => ctx.createdNodes.filter((n) => n.kind === kind)
  const end = (source: MockNode) => (source as unknown as { onended: () => void }).onended()
  const retired = (engine: AudioEngine) => (engine as unknown as { retiredCueChains: Map<unknown, unknown> }).retiredCueChains
  const echoTail = (ctx: MockAudioContext) =>
    delayTail({ delayTime: 0.1, delayFeedback: 0.5, delayMix: 0.4, distortion: 0, reverbMix: 0 }, ctx.sampleRate)

  it('stays connected until its echoes have rung out, whenever its note reports its end', async () => {
    const { ctx, engine, disconnect } = await mocked()
    engine.loadCues(ECHO)
    engine.playCue('g', 0.5)
    engine.loadCues(OTHER)
    // A silent clock, stopped where the note's stop, 10 ms after its 10 ms
    // release, is followed by 21 passes of feedback 0.45
    const [clock, ...more] = made(ctx, 'constant')
    expect(more).toHaveLength(0)
    expect(clock!.offset.value).toBe(0)
    expect(clock!.stopped).toHaveLength(1)
    expect(clock!.stopped[0]).toBeCloseTo(0.5 + 0.15 + 0.01 + 0.01 + echoTail(ctx), 12)
    expect(echoTail(ctx)).toBeCloseTo(21 * (0.1 + 129 / ctx.sampleRate) + 128 / ctx.sampleRate, 12)
    for (const osc of made(ctx, 'oscillator')) end(osc)
    expect(disconnect).not.toHaveBeenCalled()
    end(clock!)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(clock!.disconnect).toHaveBeenCalled()
    expect(retired(engine).size).toBe(0)
  })

  it('is disconnected at once when nothing it played still rings', async () => {
    const { ctx, engine, disconnect } = await mocked()
    engine.loadCues(ECHO)
    engine.loadCues(OTHER)
    expect(disconnect).toHaveBeenCalledTimes(1)
    engine.loadCues(ECHO)
    engine.playCue('g', 0.5)
    ctx.currentTime = 0.5 + 0.17 + echoTail(ctx) + 0.001
    engine.loadCues(OTHER)
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(made(ctx, 'constant')).toHaveLength(0)
    expect(retired(engine).size).toBe(0)
  })

  it('leaves no chain connected after the document is replaced 100 times while cues ring', async () => {
    const { ctx, engine, disconnect } = await mocked()
    for (let i = 0; i < 100; i++) {
      engine.loadCues(ECHO)
      engine.playCue('g', 0.5 + i * 0.01)
    }
    engine.loadCues(OTHER)
    expect(disconnect).not.toHaveBeenCalled()
    const clocks = made(ctx, 'constant')
    expect(clocks).toHaveLength(100)
    for (const source of [...clocks, ...made(ctx, 'oscillator')]) end(source)
    expect(disconnect).toHaveBeenCalledTimes(100)
    expect(new Set(disconnect.mock.contexts).size).toBe(100)
    for (const clock of clocks) expect(clock.disconnect).toHaveBeenCalled()
    expect(retired(engine).size).toBe(0)
  })

  it('is disconnected when the engine is destroyed, with its echoes still to ring', async () => {
    const { ctx, engine, disconnect } = await mocked()
    engine.loadCues(ECHO)
    engine.playCue('g', 0.5)
    engine.loadCues(OTHER)
    engine.destroy()
    const [clock] = made(ctx, 'constant')
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(clock!.disconnect).toHaveBeenCalled()
    // Its clock, run out on a context the caller keeps, does nothing more
    expect((clock as unknown as { onended: unknown }).onended).toBeNull()
    expect(retired(engine).size).toBe(0)
  })

  it('is disconnected once its echoes have rung out, rendered, after the document is replaced 50 times', async () => {
    // Each chain rings out within about 0.5 s of its note's stop
    const short = doc({ g: [note('g1', 55, 0)] }, sine({ delayTime: 0.05, delayFeedback: 0.2, delayMix: 0.4 }))
    const disconnect = vi.spyOn(EffectsChain.prototype, 'disconnect')
    const ctx = new OfflineAudioContext(1, Math.round(2 * SAMPLE_RATE), SAMPLE_RATE)
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    for (let i = 0; i < 50; i++) {
      engine.loadCues(short)
      engine.playCue('g', START + i * 0.02)
    }
    engine.loadCues(OTHER)
    expect(disconnect).not.toHaveBeenCalled()
    await ctx.startRendering()
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(50), { timeout: 5000 })
    expect(new Set(disconnect.mock.contexts).size).toBe(50)
    expect(retired(engine).size).toBe(0)
  })
})
