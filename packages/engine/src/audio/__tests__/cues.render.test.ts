import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { EffectsChain, RUNG_OUT, delayTail } from '../EffectsChain'
import { VoiceSynthesizer, filterTail } from '../VoiceSynthesizer'
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
  installOfflineAudioContext,
  largestDifference,
  renderInLockstep,
  retryRefused,
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

/** A cue instrument with a decay of fixed length, which is what sine() makes. */
type FixedDecay = Extract<CueInstrument, { decay: number }>

const sine = (overrides: Partial<FixedDecay> = {}): CueInstrument => ({
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
/** One short note through a lowpass at 28 Hz with 20 dB of resonance, which rings for nearly 2 s. */
const FILTERED = doc({ g: [note('g1', 55, 0)] }, sine({ filterType: 'lowpass', filterCutoff: 0.05, filterResonance: 1 }))

/** After ECHO's note has stopped, at START + 0.17 s, and while its echoes ring. */
const ECHOES_RING_AT = 0.4

/**
 * Render with every source's end reported to the engine once the render has
 * finished, as node-web-audio-api usually delivers it. It once delivered one
 * first, and only then were a replaced cue's echoes cut (#123). Each end is
 * held with the time its source stops, and reported if the source has stopped
 * by the render's end. Oscillators and the engine's silent clocks are held
 * alike.
 *
 * An end reported during the render, as Chromium and WebKit report one, is
 * tested in those browsers, not here: cues.replaced.browser.test.ts and
 * cues.filter.browser.test.ts. node-web-audio-api 2.2.0 cannot hold an
 * offline render at a point every time. Its `suspend` registers the
 * suspension on a worker thread after the call returns, so the render can
 * start first and refuse it; under load, 9.5% of the suite's suspension
 * renders had one refused.
 */
async function renderReportingEndsAfter(cues: CueDocument, play: (engine: AudioEngine) => void): Promise<Float32Array> {
  const { ctx, engine } = await engineWith()
  const held: Array<{ stopsAt: number; report: () => void }> = []
  const hold = <T extends { stop(when?: number): void }>(source: T): T => {
    const end = { stopsAt: Infinity, report: () => {} }
    const stop = source.stop.bind(source)
    source.stop = (when = 0) => {
      end.stopsAt = when
      stop(when)
    }
    Object.defineProperty(source, 'onended', {
      set: (report: () => void) => {
        end.report = report
        held.push(end)
      },
    })
    return source
  }
  const createOscillator = ctx.createOscillator.bind(ctx)
  ctx.createOscillator = () => hold(createOscillator())
  const createConstantSource = ctx.createConstantSource.bind(ctx)
  ctx.createConstantSource = () => hold(createConstantSource())
  engine.loadCues(cues)
  play(engine)
  const buffer = await ctx.startRendering()
  for (const end of held.filter((e) => e.stopsAt <= ctx.length / SAMPLE_RATE)) end.report()
  return Float32Array.from(buffer.getChannelData(0))
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
    // A linear envelope has no floor
    const linear = sine({ envelopeCurve: 'linear', sustain: 1, attack: 0 })
    delete (linear as Partial<CueInstrument>).envelopeFloor
    const steady = doc({ hold: [note('h', 69, 0, { duration: 0.4, level: 0.5 })] }, linear)
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

  it("plays out a ringing cue through its effects chain when the document is replaced under it, its note's end reported after the render", async () => {
    const kept = await renderReportingEndsAfter(ECHO, (e) => {
      e.playCue('g', START)
      e.loadCues(OTHER)
    })
    const plain = await render((e) => e.playCue('g', START), ECHO)
    // Reporting the ends after the render changes nothing by itself
    expect(largestDifference(await renderReportingEndsAfter(ECHO, (e) => e.playCue('g', START)), plain)).toBe(0)
    // The echoes are there, and the same as if the document had stayed
    expect(peakIn(plain, ECHOES_RING_AT, ECHOES_RING_AT + 0.15)).toBeGreaterThan(0.01)
    expect(largestDifference(kept, plain)).toBe(0)
  })

  // A voice's end reported during the render, its filter's ring and its
  // echoes kept, is held in Chromium and WebKit, which report it so: see
  // renderReportingEndsAfter.

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

describe("a note's oscillator is set with values, not events at its start", () => {
  // In Chrome 154, an oscillator whose frequency is an automation event at a
  // start that falls inside a render quantum begins with a different phase
  // from one whose frequency is a value: a 0.5 sine started 96 frames into a
  // quantum differed by up to 0.998. Hand-built cues set values, so a cue's
  // single-note voices do too, and match them in Chrome as well. A music
  // note's oscillators are made for it alone, so their frequency and detune
  // are values too, and a song note starts in Chrome as it does in WebKit.
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

  it('sets a music note frequency as a value too, with no event', () => {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode)
    voice.noteOn({ pitch: 55, velocity: 100, instrument: PAIR.instruments.sine! }, 0.09)
    const oscillator = ctx.createdNodes.find((n) => n.kind === 'oscillator')!
    expect(oscillator.frequency.value).toBe(midiToFrequency(55))
    expect(oscillator.frequency.setValueAtTime).not.toHaveBeenCalled()
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

describe('cue voices', () => {
  const voices = (engine: AudioEngine) => (engine as unknown as { cueVoices: Set<unknown> }).cueVoices
  const end = (source: MockNode) => (source as unknown as { onended?: () => void }).onended?.()
  async function mocked() {
    const ctx = createMockAudioContext()
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    const dispose = vi.spyOn(VoiceSynthesizer.prototype, 'dispose')
    return { ctx, engine, dispose }
  }

  it('are every one disconnected once they have ended, filtered or not, through 100 plays and replacements', async () => {
    const { ctx, engine, dispose } = await mocked()
    for (let i = 0; i < 100; i++) {
      engine.loadCues(i % 2 === 0 ? FILTERED : ECHO)
      engine.playCue('g', 0.5 + i * 0.01)
    }
    engine.loadCues(OTHER)
    expect(voices(engine).size).toBe(100)
    const sources = ctx.createdNodes.filter((n) => n.kind === 'oscillator' || n.kind === 'constant')
    // 50 filtered voices end by their clocks, 50 echo chains by theirs
    expect(sources.filter((n) => n.kind === 'constant')).toHaveLength(100)
    for (const source of sources) end(source)
    expect(dispose).toHaveBeenCalledTimes(100)
    expect(new Set(dispose.mock.contexts).size).toBe(100)
    for (const clock of sources.filter((n) => n.kind === 'constant')) expect(clock.disconnect).toHaveBeenCalled()
    expect(voices(engine).size).toBe(0)
  })

  it('still ringing are disconnected when the engine is destroyed', async () => {
    const { ctx, engine, dispose } = await mocked()
    engine.loadCues(FILTERED)
    engine.playCue('g', 0.5)
    engine.destroy()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(ctx.createdNodes.find((n) => n.kind === 'constant')!.disconnect).toHaveBeenCalled()
    expect(voices(engine).size).toBe(0)
  })

  it('are every one disconnected by their own clocks, rendered, after 50 filtered plays', async () => {
    // Each voice's filter rings out within about 0.03 s of its note's stop
    const short = doc({ g: [note('g1', 55, 0)] }, sine({ filterType: 'lowpass', filterCutoff: 0.5, filterResonance: 0.5 }))
    const dispose = vi.spyOn(VoiceSynthesizer.prototype, 'dispose')
    const ctx = new OfflineAudioContext(1, Math.round(2 * SAMPLE_RATE), SAMPLE_RATE)
    const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
    await engine.initialize()
    for (let i = 0; i < 50; i++) {
      engine.loadCues(short)
      engine.playCue('g', START + i * 0.02)
    }
    await ctx.startRendering()
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(50), { timeout: 5000 })
    expect(new Set(dispose.mock.contexts).size).toBe(50)
    expect(voices(engine).size).toBe(0)
  })
})

describe("a filter's ring, rendered", () => {
  // Each type a voice has: the longest ring of all, rings that fade before a
  // cycle, and a repeated pole, at a bandpass's least resonance
  const FILTERS: Record<string, Pick<CueInstrument, 'filterType' | 'filterCutoff' | 'filterResonance'>> = {
    'a resonant lowpass': { filterType: 'lowpass', filterCutoff: 0.05, filterResonance: 1 },
    'a resonant highpass': { filterType: 'highpass', filterCutoff: 0.3, filterResonance: 1 },
    'a bandpass at 20 Hz with a Q of 20, the longest ring': { filterType: 'bandpass', filterCutoff: 0, filterResonance: 1 },
    'a notch': { filterType: 'notch', filterCutoff: 0.2, filterResonance: 0.5 },
    'a bandpass at its least resonance, a repeated pole': { filterType: 'bandpass', filterCutoff: 0.3, filterResonance: 0 },
  }
  for (const [name, filter] of Object.entries(FILTERS)) {
    it(`holds nothing above 2^-24 of the ring heard past where the voice stops waiting: ${name}`, async () => {
      const stopsAt = START + 0.17
      const deadline = stopsAt + filterTail(filter, SAMPLE_RATE)
      // No voice is disconnected in this render, so the whole ring is in it
      vi.spyOn(VoiceSynthesizer.prototype, 'dispose').mockImplementation(() => {})
      const { ctx, engine } = await engineWith(1, deadline + 0.5)
      engine.loadCues(doc({ g: [note('g1', 55, 0)] }, sine(filter)))
      engine.playCue('g', START)
      const whole = Float32Array.from((await ctx.startRendering()).getChannelData(0))
      const heard = peakIn(whole, stopsAt, deadline)
      expect(heard).toBeGreaterThan(0)
      expect(peakIn(whole, deadline, deadline + 0.5)).toBeLessThanOrEqual(RUNG_OUT * heard)
    })
  }
})
