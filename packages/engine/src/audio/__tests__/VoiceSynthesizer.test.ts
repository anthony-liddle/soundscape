import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VoiceSynthesizer } from '../VoiceSynthesizer'
import { defaultInstrumentParams } from '../../types'
import type { InstrumentParams } from '../../types'
import { midiToFrequency, normalizedToLfoFilterDepth, normalizedToLfoPitchDepth } from '../../utils/pitch'
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

    it('falls back to cancel + set-current-value when cancelAndHoldAtTime is unavailable (Firefox)', () => {
      const params = makeParams({ release: 0.5 })
      voice.noteOn({ pitch: 60, velocity: 100, instrument: params }, 0)
      const gain = gainNode().gain
      // Simulate an implementation without cancelAndHoldAtTime
      ;(gain as { cancelAndHoldAtTime?: unknown }).cancelAndHoldAtTime = undefined
      gain.value = 0.25
      gain.calls.length = 0

      voice.noteOff(params, 0.1)
      const release = normalizedToADSR(0.5, 'release')
      expect(gain.calls).toEqual([
        { method: 'cancel', time: 0.1 },
        { method: 'set', value: 0.25, time: 0.1 },
        { method: 'ramp', value: 0, time: 0.1 + release },
      ])
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
