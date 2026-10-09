import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VoiceSynthesizer, filterTail } from '../VoiceSynthesizer'
import { RUNG_OUT } from '../EffectsChain'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'
import type { CueInstrument } from '../../cues/types'
import {
  midiToFrequency,
  normalizedToFilterFreq,
  normalizedToLfoFilterDepth,
  normalizedToLfoPitchDepth,
  normalizedToQ,
} from '../../utils/pitch'
import { normalizedToADSR } from '../../utils/time'
import { createMockAudioContext, isConnected } from './mockWebAudio'
import type { MockAudioContext, MockNode } from './mockWebAudio'

/**
 * Characterization tests: these pin down the CURRENT behavior of the voice,
 * including known quirks slated to change in 0.3.0. Tests marked
 * [characterizes-bug] assert buggy behavior on purpose — when the fix lands,
 * flip the assertion in the same commit.
 */

function makeParams(overrides: Partial<InstrumentParams> = {}): InstrumentParams {
  return { ...defaultInstrumentParams, ...overrides }
}

describe('VoiceSynthesizer', () => {
  let ctx: MockAudioContext
  let outputNode: MockNode
  let voice: VoiceSynthesizer

  const audioCtx = () => ctx as unknown as AudioContext

  beforeEach(() => {
    vi.useFakeTimers()
    ctx = createMockAudioContext()
    outputNode = ctx.createGain()
    voice = new VoiceSynthesizer(audioCtx(), outputNode as unknown as AudioNode)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Constructor creates, in order: gain (ADSR), filter, output — after the
  // externally created outputNode at index 0.
  const gainNode = () => ctx.createdNodes[1]!
  const filterNode = () => ctx.createdNodes[2]!
  const voiceOutput = () => ctx.createdNodes[3]!
  const oscillators = () => ctx.createdNodes.filter((n) => n.kind === 'oscillator')

  describe('routing', () => {
    it('wires oscillator gain -> filter -> output -> destination node', () => {
      expect(isConnected(gainNode(), filterNode())).toBe(true)
      expect(isConnected(filterNode(), voiceOutput())).toBe(true)
      expect(isConnected(voiceOutput(), outputNode)).toBe(true)
    })

    it('starts silent with a lowpass filter', () => {
      expect(gainNode().gain.value).toBe(0)
      expect(filterNode().type).toBe('lowpass')
    })
  })

  describe('noteOn oscillators', () => {
    it('creates a single oscillator when unisonDetune is 0', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams({ unisonDetune: 0 }) }, 0)
      expect(oscillators()).toHaveLength(1)
      const osc = oscillators()[0]!
      expect(osc.type).toBe(defaultInstrumentParams.waveform)
      expect(osc.frequency.calls[0]).toEqual({ method: 'set', value: midiToFrequency(60), time: 0 })
      expect(osc.started).toEqual([0])
      expect(isConnected(osc, gainNode())).toBe(true)
    })

    it('creates two symmetrically detuned oscillators when unisonDetune > 0', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams({ unisonDetune: 0.2 }) }, 0)
      const oscs = oscillators()
      expect(oscs).toHaveLength(2)
      const cents = 0.2 * 50
      expect(oscs[0]!.detune.calls[0]!.value).toBe(-cents / 2)
      expect(oscs[1]!.detune.calls[0]!.value).toBe(cents / 2)
    })

    it('applies pitchOffset to the oscillator frequency', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams({ pitchOffset: -12 }) }, 0)
      expect(oscillators()[0]!.frequency.calls[0]!.value).toBeCloseTo(midiToFrequency(48))
    })

    it('clamps a start time in the past to the current time', () => {
      ctx.currentTime = 5
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams() }, 1)
      expect(oscillators()[0]!.started).toEqual([5])
    })
  })

  describe('ADSR envelope', () => {
    it('schedules cancel, zero, attack ramp, then decay ramp to sustain', () => {
      const params = makeParams({ velocityResponse: 0, attack: 0.5, decay: 0.5, sustain: 0.6 })
      voice.noteOn({ pitch: 60, velocity: 100, instrument: params }, 1)

      const attack = normalizedToADSR(0.5, 'attack')
      const decay = normalizedToADSR(0.5, 'decay')
      const maxAmp = 0.3 // velocityResponse 0 => velocity ignored

      expect(gainNode().gain.calls).toEqual([
        // noteOn always runs stop() first (voice-steal safety), silencing at "now"
        { method: 'cancel', time: 0 },
        { method: 'set', value: 0, time: 0 },
        // then the envelope is scheduled at the requested start time
        { method: 'cancel', time: 1 },
        { method: 'set', value: 0, time: 1 },
        { method: 'ramp', value: maxAmp, time: 1 + attack },
        { method: 'ramp', value: 0.6 * maxAmp, time: 1 + attack + decay },
      ])
    })

    it('scales peak amplitude by velocity when velocityResponse is 1', () => {
      const params = makeParams({ velocityResponse: 1 })
      voice.noteOn({ pitch: 60, velocity: 64, instrument: params }, 0)
      const ramp = gainNode().gain.calls.find((c) => c.method === 'ramp')!
      expect(ramp.value).toBeCloseTo(0.3 * (64 / 127))
    })
  })

  describe('LFO', () => {
    it('routes a filter-target LFO into the filter frequency param', () => {
      voice.noteOn(
        { pitch: 60, velocity: 100, instrument: makeParams({ lfoDepth: 0.5, lfoTarget: 'filter' }) },
        0
      )
      const lfo = oscillators().find((o) => o.type === 'sine')!
      const lfoGain = lfo.connections[0]! // lfo -> lfoGain
      expect(lfoGain.gain.calls[0]!.value).toBe(normalizedToLfoFilterDepth(0.5))
      expect(lfoGain.connections).toContain(filterNode().frequency)
      expect(lfo.started).toEqual([0])
    })

    it('routes a pitch-target LFO into every oscillator detune param', () => {
      voice.noteOn(
        {
          pitch: 60,
          velocity: 100,
          instrument: makeParams({ lfoDepth: 0.3, lfoTarget: 'pitch', unisonDetune: 0.2 }),
        },
        0
      )
      const toneOscs = oscillators().filter((o) => o.type !== 'sine')
      const lfo = oscillators().find((o) => o.type === 'sine')!
      const lfoGain = lfo.connections[0]!
      expect(lfoGain.gain.calls[0]!.value).toBe(normalizedToLfoPitchDepth(0.3))
      for (const osc of toneOscs) {
        expect(lfoGain.connections).toContain(osc.detune)
      }
    })

    it('creates no LFO when lfoDepth is 0', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams({ lfoDepth: 0 }) }, 0)
      expect(oscillators().filter((o) => o.type === 'sine')).toHaveLength(0)
    })
  })

  describe('noteOff', () => {
    it('ramps gain to zero over the release time and stops oscillators after it', () => {
      const params = makeParams({ release: 0.5 })
      voice.noteOn({ pitch: 60, velocity: 100, instrument: params }, 0)
      gainNode().gain.calls.length = 0

      voice.noteOff(params, 2)
      const release = normalizedToADSR(0.5, 'release')

      expect(gainNode().gain.calls[0]).toEqual({ method: 'hold', time: 2 })
      expect(gainNode().gain.calls[1]).toEqual({ method: 'ramp', value: 0, time: 2 + release })
      expect(oscillators()[0]!.stopped[0]!).toBeCloseTo(2 + release + 0.01)
    })

    it('holds the envelope at the scheduled stop time via cancelAndHoldAtTime (M3 fixed)', () => {
      // The release must start from the envelope's value AT scheduleTime —
      // not the value when noteOff happens to be invoked (up to 100 ms early
      // under the scheduler lookahead)
      const params = makeParams({ release: 0.5 })
      voice.noteOn({ pitch: 60, velocity: 100, instrument: params }, 0)
      gainNode().gain.calls.length = 0

      voice.noteOff(params, 0.1)
      const release = normalizedToADSR(0.5, 'release')
      expect(gainNode().gain.calls).toEqual([
        { method: 'hold', time: 0.1 },
        { method: 'ramp', value: 0, time: 0.1 + release },
      ])
    })

    describe('where cancelAndHoldAtTime is unavailable (Firefox)', () => {
      // The defaults: peak 0.3 scaled by velocity 100 at velocityResponse 0.5,
      // a 1.2 ms attack, a 39.9 ms decay to 0.7 of the peak
      const peak = 0.3 * (1 - 0.5 + 0.5 * (100 / 127))
      const attack = normalizedToADSR(0.01, 'attack')
      const decay = normalizedToADSR(0.1, 'decay')
      const release = normalizedToADSR(0.5, 'release')

      function releaseAt(t: number) {
        const params = makeParams({ release: 0.5 })
        voice.noteOn({ pitch: 60, velocity: 100, instrument: params }, 0)
        const gain = gainNode().gain
        ;(gain as { cancelAndHoldAtTime?: unknown }).cancelAndHoldAtTime = undefined
        // A stale reading, which the release must not use
        gain.value = 0.25
        gain.calls.length = 0
        voice.noteOff(params, t)
        return gain.calls
      }

      it('ends the envelope with a ramp to the level it has at the release, then releases', () => {
        const calls = releaseAt(0.1)
        expect(calls.map((c) => [c.method, c.time])).toEqual([
          ['cancel', 0.1],
          ['ramp', 0.1],
          ['ramp', 0.1 + release],
        ])
        // In the hold, after the decay: the sustain level, not the stale 0.25
        expect(calls[1]!.value).toBeCloseTo(0.7 * peak, 12)
        expect(calls[2]!.value).toBe(0)
      })

      it('mid-decay, ramps to the decay level at the release', () => {
        const t = attack + decay / 2
        const calls = releaseAt(t)
        expect(calls[1]).toMatchObject({ method: 'ramp', time: t })
        expect(calls[1]!.value).toBeCloseTo(peak + (0.7 * peak - peak) / 2, 12)
      })
    })

    it('does nothing when the voice is not playing', () => {
      const params = makeParams()
      voice.noteOff(params, 1)
      expect(gainNode().gain.calls).toHaveLength(0)
    })

    it('remains "playing" through the release tail, then frees the voice', () => {
      const params = makeParams({ release: 0.5 })
      voice.noteOn({ pitch: 60, velocity: 100, instrument: params }, 0)
      voice.noteOff(params, 0)
      expect(voice.getIsPlaying()).toBe(true)

      const release = normalizedToADSR(0.5, 'release')
      vi.advanceTimersByTime((release + 0.05) * 1000 + 1)
      expect(voice.getIsPlaying()).toBe(false)
    })
  })

  describe('stop (voice stealing / transport stop)', () => {
    it('immediately stops and disconnects oscillators and silences the gain', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams() }, 0)
      const osc = oscillators()[0]!
      voice.stop()

      expect(osc.stop).toHaveBeenCalled()
      expect(osc.disconnect).toHaveBeenCalled()
      expect(voice.getIsPlaying()).toBe(false)
      const lastCalls = gainNode().gain.calls.slice(-2)
      expect(lastCalls[0]!.method).toBe('cancel')
      expect(lastCalls[1]).toEqual({ method: 'set', value: 0, time: ctx.currentTime })
    })

    it('noteOn while playing stops the previous oscillators first', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams() }, 0)
      const firstOsc = oscillators()[0]!
      voice.noteOn({ pitch: 64, velocity: 100, instrument: makeParams() }, 1)
      expect(firstOsc.stop).toHaveBeenCalled()
      expect(oscillators()).toHaveLength(2)
    })
  })

  describe('disconnect', () => {
    it('stops the voice and disconnects the internal chain', () => {
      voice.noteOn({ pitch: 60, velocity: 100, instrument: makeParams() }, 0)
      voice.disconnect()
      expect(voice.getIsPlaying()).toBe(false)
      expect(gainNode().disconnect).toHaveBeenCalled()
      expect(filterNode().disconnect).toHaveBeenCalled()
      expect(voiceOutput().disconnect).toHaveBeenCalled()
    })
  })
})

describe("a cue instrument whose decay lasts until each note's release", () => {
  const untilRelease = {
    ...Object.fromEntries(Object.entries(makeParams()).filter(([key]) => key !== 'decay')),
    decayUntilRelease: true,
  } as unknown as CueInstrument

  it('cannot start a note with noteOn, which does not know when the release is, and starts nothing', () => {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as AudioContext, ctx.createGain() as unknown as AudioNode)
    const before = ctx.createdNodes.length
    expect(() => voice.noteOn({ pitch: 60, velocity: 100, instrument: untilRelease }, 0)).toThrow(/playNote/)
    expect(ctx.createdNodes.slice(before).filter((n) => n.kind === 'oscillator')).toEqual([])
  })

  it('plays a whole note with playNote, its decay ending at the release', () => {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as AudioContext, ctx.createGain() as unknown as AudioNode)
    const before = ctx.createdNodes.length
    expect(() => voice.playNote({ pitch: 60, velocity: 100, instrument: untilRelease }, 0, 0.25)).not.toThrow()
    expect(ctx.createdNodes.slice(before).filter((n) => n.kind === 'oscillator').length).toBeGreaterThan(0)
  })
})

describe('a whole note through a filter', () => {
  const RESONANT = { filterType: 'lowpass', filterCutoff: 0.05, filterResonance: 1 } as const
  function play(filter: Pick<InstrumentParams, 'filterType' | 'filterCutoff' | 'filterResonance'>) {
    const ctx = createMockAudioContext()
    const voice = new VoiceSynthesizer(ctx as unknown as AudioContext, ctx.createGain() as unknown as AudioNode)
    // The voice made, in order: gain (ADSR), filter, output
    const output = ctx.createdNodes[3]!
    const ended = vi.fn()
    voice.onEnded = ended
    const before = ctx.createdNodes.length
    const silentAt = voice.playNote({ pitch: 55, velocity: 100, instrument: makeParams(filter) }, 0.5, 0.15)
    const made = ctx.createdNodes.slice(before)
    return { ctx, voice, output, ended, silentAt, made }
  }
  const end = (source: MockNode) => (source as unknown as { onended: () => void }).onended()

  it('ends when its filter has rung out, by a silent clock stopped then, not when its oscillators stop', () => {
    const { ctx, output, ended, silentAt, made } = play(RESONANT)
    const [clock, ...more] = made.filter((n) => n.kind === 'constant')
    const stopsAt = made.find((n) => n.kind === 'oscillator')!.stopped[0]!
    expect(more).toHaveLength(0)
    expect(clock!.offset.value).toBe(0)
    expect(clock!.started).toEqual([0.5])
    // playNote returns the time the voice falls silent, the clock's stop
    expect(silentAt).toBe(stopsAt + filterTail(RESONANT, ctx.sampleRate))
    expect(clock!.stopped).toEqual([silentAt])
    // After the filter, so the filter's input still falls silent
    expect(clock!.connections).toEqual([output])
    for (const osc of made.filter((n) => n.kind === 'oscillator')) {
      expect((osc as unknown as { onended?: unknown }).onended).toBeUndefined()
    }
    expect(ended).not.toHaveBeenCalled()
    end(clock!)
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('needs no clock with no filter, and ends with its oscillators', () => {
    const { ended, silentAt, made } = play({ filterType: 'none', filterCutoff: 0.05, filterResonance: 1 })
    expect(made.filter((n) => n.kind === 'constant')).toHaveLength(0)
    expect(silentAt).toBe(made.find((n) => n.kind === 'oscillator')!.stopped[0])
    end(made.find((n) => n.kind === 'oscillator')!)
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('disconnects its clock with every other node when disposed', () => {
    const { voice, made } = play(RESONANT)
    voice.dispose()
    expect(made.find((n) => n.kind === 'constant')!.disconnect).toHaveBeenCalled()
  })
})

describe('filterTail', () => {
  const RATE = 48000
  const QUANTUM = 128 / RATE
  type Type = 'lowpass' | 'highpass' | 'bandpass' | 'notch'
  const tail = (filterType: Type, filterCutoff: number, filterResonance: number, rate = RATE) =>
    filterTail({ filterType, filterCutoff, filterResonance }, rate)

  it('is 0 with no filter, and with a cutoff at Nyquist, where the filter has nothing to ring with', () => {
    expect(filterTail({ filterType: 'none', filterCutoff: 0.05, filterResonance: 1 }, RATE)).toBe(0)
    // 20 kHz is past Nyquist at 32 kHz
    expect(tail('lowpass', 1, 1, 32000)).toBe(0)
  })

  it('reads Q in dB for a lowpass or highpass and as it is for a bandpass or notch, which ring longer', () => {
    expect(tail('highpass', 0, 1)).toBe(tail('lowpass', 0, 1))
    expect(tail('notch', 0, 1)).toBe(tail('bandpass', 0, 1))
    expect(tail('bandpass', 0, 1)).toBeGreaterThan(tail('lowpass', 0, 1))
  })

  it('rings 5.35 s at the longest, a bandpass or notch at 20 Hz with a Q of 20, and nothing rings longer', () => {
    expect(tail('bandpass', 0, 1)).toBeCloseTo(5.348, 3)
    let longest = 0
    for (const type of ['lowpass', 'highpass', 'bandpass', 'notch'] as const) {
      for (let c = 0; c <= 20; c++) for (let r = 0; r <= 20; r++) longest = Math.max(longest, tail(type, c / 20, r / 20))
    }
    expect(longest).toBe(tail('bandpass', 0, 1))
  })

  it("counts a resonant ring until its level is RUNG_OUT, less what a sampled peak can miss, and a cycle more", () => {
    // The spec's lowpass at 28 Hz and 20 dB, its poles worked out here
    const w0 = (2 * Math.PI * normalizedToFilterFreq(0.05)) / RATE
    const alpha = Math.sin(w0) / (2 * 10 ** (normalizedToQ(1) / 20))
    const radius = Math.sqrt((1 - alpha) / (1 + alpha))
    const theta = Math.acos(Math.cos(w0) / ((1 + alpha) * radius))
    const samples = Math.log(RUNG_OUT * Math.cos(theta / 2)) / Math.log(radius) + (2 * Math.PI) / theta
    expect(tail('lowpass', 0.05, 1)).toBe(Math.ceil(samples) / RATE + QUANTUM)
    expect(tail('lowpass', 0.05, 1)).toBeCloseTo(1.9125, 4)
  })

  it('counts a repeated pole, at a bandpass at its least resonance, until (2n + 1) r^n is RUNG_OUT', () => {
    const w0 = (2 * Math.PI * normalizedToFilterFreq(0.3)) / RATE
    const radius = Math.cos(w0) / (1 + Math.sin(w0))
    const n = Math.round((tail('bandpass', 0.3, 0) - QUANTUM) * RATE)
    expect((2 * n + 1) * radius ** n).toBeLessThanOrEqual(RUNG_OUT)
    expect((2 * n - 1) * radius ** (n - 1)).toBeGreaterThan(RUNG_OUT)
  })
})
