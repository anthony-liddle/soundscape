import type { InstrumentParams } from '../types';
import {
  midiToFrequency,
  normalizedToFilterFreq,
  normalizedToQ,
  applyPitchOffset,
  normalizedToLfoRate,
  normalizedToLfoFilterDepth,
  normalizedToLfoPitchDepth,
} from '../utils/pitch';
import { normalizedToADSR } from '../utils/time';

/** Parameters passed to a voice when triggering a note-on event. */
export interface VoiceParams {
  /** MIDI pitch value (0–127). Middle C is 60. */
  pitch: number;
  /** Note velocity (0–127). Scales amplitude when `instrument.velocityResponse > 0`. */
  velocity: number;
  /** The full instrument parameter set that defines the synthesis behaviour. */
  instrument: InstrumentParams;
  /**
   * The envelope's peak as an absolute linear gain. When given, it replaces the
   * voice's 0.3 ceiling scaled by velocity, so neither `velocity` nor the
   * instrument's `velocityResponse` affects the level. Cues use it.
   */
  peak?: number;
  /**
   * Set the note's frequency, detune, filter and LFO settings as the params'
   * values, rather than as automation events at its start. Only for a voice
   * that plays this one note, as a cue's voices do. The two sound the same
   * everywhere but Chrome, where an oscillator whose frequency is an event at
   * a start falling inside a render quantum begins with a different phase.
   * Hand-built Web Audio cues set values, so cues do too.
   */
  setAsValues?: boolean;
}

/**
 * A single polyphonic voice: one or two oscillators routed through an ADSR gain
 * envelope and a configurable filter, with optional LFO modulation.
 *
 * Voices are pooled per track by {@link AudioEngine} (up to 8 per track).
 * When all voices are busy, the oldest voice is stolen via {@link stop}.
 */
export class VoiceSynthesizer {
  private context: BaseAudioContext;
  private oscillators: OscillatorNode[] = [];
  private lfoNode: OscillatorNode | null = null;
  private lfoGainNode: GainNode | null = null;
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;
  private output: GainNode;
  private isPlaying = false;
  private releaseTimeout: ReturnType<typeof setTimeout> | null = null;
  /** True while the gain feeds the output directly, with no filter between. */
  private filterBypassed = false;
  /**
   * Called once the voice's oscillators have stopped, on the audio clock. Set
   * by whoever wants to release the voice's nodes after its sound has ended.
   */
  onEnded: (() => void) | null = null;
  /** The exponential envelope last scheduled, so a release can know its level. */
  private exponentialEnvelope: ExponentialEnvelope | null = null;

  constructor(context: BaseAudioContext, outputNode: AudioNode) {
    this.context = context;

    // Create nodes
    this.gainNode = context.createGain();
    this.filterNode = context.createBiquadFilter();
    this.output = context.createGain();

    // Set up routing: oscillator(s) -> gain (ADSR) -> filter -> output
    this.gainNode.connect(this.filterNode);
    this.filterNode.connect(this.output);
    this.output.connect(outputNode);

    // Initialize
    this.gainNode.gain.value = 0;
    this.filterNode.type = 'lowpass';
  }

  /**
   * Triggers a note-on event, starting the oscillator(s), ADSR attack, and LFO.
   *
   * If the voice is already playing, it is stopped first (no click protection —
   * the caller is responsible for voice stealing).
   *
   * @param params - Pitch, velocity, and instrument parameters for this note.
   * @param startTime - `AudioContext` time (in seconds) when the note should begin.
   *   Pass `context.currentTime` to start immediately.
   */
  noteOn(params: VoiceParams, startTime: number): void {
    if (this.releaseTimeout !== null) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    // Stop any existing oscillators/LFO
    this.stop();

    const { pitch, velocity, instrument } = params;
    const now = this.context.currentTime;
    const scheduleTime = Math.max(now, startTime);
    // Settings fixed for the whole note: an event at its start, as always, or
    // for a single-note voice that asks, the param's value.
    const fix = (param: AudioParam, value: number): void => {
      if (params.setAsValues) param.value = value;
      else param.setValueAtTime(value, scheduleTime);
    };

    // Apply pitch offset
    const adjustedPitch = applyPitchOffset(pitch, instrument.pitchOffset);
    const frequency = midiToFrequency(adjustedPitch);

    // Unison: 1 oscillator when unisonDetune === 0, 2 when > 0
    const detuneCents = (instrument.unisonDetune ?? 0) * 50;
    const oscCount = detuneCents > 0 ? 2 : 1;

    this.oscillators = Array.from({ length: oscCount }, (_, i) => {
      const osc = this.context.createOscillator();
      osc.type = instrument.waveform as OscillatorType;
      fix(osc.frequency, frequency);
      if (oscCount === 2) {
        fix(osc.detune, i === 0 ? -detuneCents / 2 : detuneCents / 2);
      }
      osc.connect(this.gainNode);
      osc.start(scheduleTime);
      return osc;
    });

    // Set filter parameters, or take the filter out of the path entirely
    this.routeFilter(instrument.filterType === 'none');
    if (!this.filterBypassed) {
      this.filterNode.type = (instrument.filterType ?? 'lowpass') as BiquadFilterType;
      fix(this.filterNode.frequency, normalizedToFilterFreq(instrument.filterCutoff));
      fix(this.filterNode.Q, normalizedToQ(instrument.filterResonance));
    }

    // LFO modulation
    const lfoDepth = instrument.lfoDepth ?? 0;
    if (lfoDepth > 0) {
      const lfoRate = normalizedToLfoRate(instrument.lfoRate ?? 0.3);
      const lfoTarget = instrument.lfoTarget ?? 'filter';

      this.lfoNode = this.context.createOscillator();
      this.lfoGainNode = this.context.createGain();

      this.lfoNode.type = 'sine';
      fix(this.lfoNode.frequency, lfoRate);

      if (lfoTarget === 'filter') {
        fix(this.lfoGainNode.gain, normalizedToLfoFilterDepth(lfoDepth));
        this.lfoNode.connect(this.lfoGainNode);
        this.lfoGainNode.connect(this.filterNode.frequency);
      } else {
        // pitch vibrato — modulate detune on all oscillators
        fix(this.lfoGainNode.gain, normalizedToLfoPitchDepth(lfoDepth));
        this.lfoNode.connect(this.lfoGainNode);
        for (const osc of this.oscillators) {
          this.lfoGainNode.connect(osc.detune);
        }
      }

      this.lfoNode.start(scheduleTime);
    }

    // Calculate velocity-adjusted amplitude, unless an absolute peak is given
    const normalizedVelocity = velocity / 127;
    const velocityScale = 1 - instrument.velocityResponse + instrument.velocityResponse * normalizedVelocity;
    const maxAmplitude = params.peak ?? 0.3 * velocityScale; // Keep reasonable volume

    // ADSR envelope
    const attackTime = normalizedToADSR(instrument.attack, 'attack');
    const decayTime = normalizedToADSR(instrument.decay, 'decay');
    const sustainLevel = instrument.sustain * maxAmplitude;

    // Cancel any scheduled values and set to 0
    this.gainNode.gain.cancelScheduledValues(scheduleTime);

    if (instrument.envelopeCurve === 'exponential' && maxAmplitude > 0) {
      // Exponential ramps cannot start from or reach zero, so the envelope runs
      // from the floor, to the peak, and back down toward the floor.
      const floor = envelopeFloorOf(instrument);
      const envelope: ExponentialEnvelope = {
        start: scheduleTime,
        attackEnd: scheduleTime + attackTime,
        decayEnd: scheduleTime + attackTime + decayTime,
        floor,
        peak: maxAmplitude,
        sustain: Math.max(sustainLevel, floor),
      };
      this.gainNode.gain.setValueAtTime(floor, envelope.start);
      this.gainNode.gain.exponentialRampToValueAtTime(envelope.peak, envelope.attackEnd);
      this.gainNode.gain.exponentialRampToValueAtTime(envelope.sustain, envelope.decayEnd);
      this.exponentialEnvelope = envelope;
    } else {
      this.exponentialEnvelope = null;
      this.gainNode.gain.setValueAtTime(0, scheduleTime);

      // Attack
      this.gainNode.gain.linearRampToValueAtTime(maxAmplitude, scheduleTime + attackTime);

      // Decay to sustain
      this.gainNode.gain.linearRampToValueAtTime(sustainLevel, scheduleTime + attackTime + decayTime);
    }

    this.isPlaying = true;
  }

  /**
   * Put the filter in the voice's path, or take it out. Rewires only when the
   * routing actually changes, so a voice that never sees `'none'` keeps the
   * exact graph it has always had.
   */
  private routeFilter(bypass: boolean): void {
    if (bypass === this.filterBypassed) return;
    if (bypass) {
      this.gainNode.disconnect(this.filterNode);
      this.gainNode.connect(this.output);
    } else {
      this.gainNode.disconnect(this.output);
      this.gainNode.connect(this.filterNode);
    }
    this.filterBypassed = bypass;
  }

  /**
   * Triggers a note-off event, starting the ADSR release phase.
   *
   * The oscillators continue running until the release tail completes, then
   * stop and are cleaned up automatically.
   *
   * @param instrument - Instrument params used to read the `release` duration.
   * @param stopTime - `AudioContext` time (in seconds) when the release should begin.
   *   Pass `context.currentTime` to release immediately.
   */
  noteOff(instrument: InstrumentParams, stopTime: number): void {
    if (this.oscillators.length === 0 || !this.isPlaying) return;

    const now = this.context.currentTime;
    const scheduleTime = Math.max(now, stopTime);
    const releaseTime = normalizedToADSR(instrument.release, 'release');

    // Start the release from the envelope's value AT scheduleTime. noteOff is
    // typically invoked up to ~100 ms early (scheduler lookahead), so reading
    // gain.value here would capture a stale level and cause clicks.
    const gain = this.gainNode.gain;
    const exponential = instrument.envelopeCurve === 'exponential';
    const floor = exponential ? envelopeFloorOf(instrument) : 0;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      // Holds the envelope's own value at scheduleTime, mid-ramp included,
      // exponential or linear.
      gain.cancelAndHoldAtTime(scheduleTime);
    } else {
      // Firefox has no cancelAndHoldAtTime — approximate with the current
      // value; mid-envelope releases may start from a slightly stale level.
      const envelope = exponential ? this.exponentialEnvelope : null;
      if (envelope) {
        // An exponential envelope reads nothing: the voice scheduled it, so it
        // knows the level at scheduleTime. Cancelling removes the ramp in
        // progress, so mid-ramp it is ended again at that level, which traces
        // exactly the curve it was on: what cancelAndHoldAtTime would hold.
        const held = exponentialLevelAt(envelope, scheduleTime);
        gain.cancelScheduledValues(scheduleTime);
        if (scheduleTime > envelope.start && scheduleTime < envelope.decayEnd) {
          gain.exponentialRampToValueAtTime(held, scheduleTime);
        } else {
          gain.setValueAtTime(held, scheduleTime);
        }
      } else {
        const currentGain = gain.value;
        gain.cancelScheduledValues(scheduleTime);
        gain.setValueAtTime(currentGain, scheduleTime);
      }
    }

    // Release envelope: to zero, or for an exponential one, to its floor, where
    // it stays until the oscillators stop
    if (exponential) {
      gain.exponentialRampToValueAtTime(floor, scheduleTime + releaseTime);
    } else {
      gain.linearRampToValueAtTime(0, scheduleTime + releaseTime);
    }

    // Stop oscillators and LFO after release
    const oscs = [...this.oscillators];
    const releaseEnd = scheduleTime + releaseTime + 0.01;
    for (const osc of oscs) {
      osc.stop(releaseEnd);
    }
    if (this.onEnded && oscs[0]) {
      const notify = this.onEnded;
      oscs[0].onended = () => notify();
    }
    if (this.lfoNode) {
      try {
        this.lfoNode.stop(releaseEnd);
      } catch {
        // LFO may already be stopped
      }
    }

    // Schedule cleanup
    const cleanupDelay = (scheduleTime - now + releaseTime + 0.05) * 1000;
    this.releaseTimeout = setTimeout(() => {
      this.oscillators = [];
      this.lfoNode = null;
      this.lfoGainNode = null;
      this.isPlaying = false;
      this.releaseTimeout = null;
    }, cleanupDelay);
  }

  /**
   * Immediately silences and disconnects all oscillators, bypassing the release envelope.
   *
   * Used for voice stealing and transport stop. May cause a slight click if the
   * voice is mid-note — prefer {@link noteOff} when a smooth release is desired.
   */
  stop(): void {
    if (this.releaseTimeout !== null) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    for (const osc of this.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Oscillator may already be stopped
      }
    }
    this.oscillators = [];

    if (this.lfoNode) {
      try {
        this.lfoNode.stop();
        this.lfoNode.disconnect();
      } catch {
        // LFO may already be stopped
      }
      this.lfoNode = null;
    }
    if (this.lfoGainNode) {
      try {
        this.lfoGainNode.disconnect();
      } catch {
        // May already be disconnected
      }
      this.lfoGainNode = null;
    }

    this.isPlaying = false;
    this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
    this.gainNode.gain.setValueAtTime(0, this.context.currentTime);
  }

  /**
   * Returns whether this voice is currently active (oscillators running).
   *
   * Used by the voice pool to find a free voice before resorting to stealing.
   *
   * @returns `true` if oscillators are running (including during release phase).
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Stops the voice and disconnects all internal audio nodes from the graph.
   *
   * Call this when the voice is being removed from the pool entirely.
   * After `disconnect()`, the voice instance should not be reused.
   */
  disconnect(): void {
    this.stop();
    this.gainNode.disconnect();
    this.filterNode.disconnect();
    this.output.disconnect();
  }
}

/**
 * The floor of an exponential envelope. Validation guarantees one wherever a
 * file or a cue document is loaded; a caller building params in code without
 * one gets an error naming the problem, not a silent fallback.
 */
function envelopeFloorOf(instrument: InstrumentParams): number {
  const floor = instrument.envelopeFloor;
  if (typeof floor !== 'number' || !Number.isFinite(floor) || floor <= 0 || floor >= 1) {
    throw new RangeError(
      `An exponential envelope needs envelopeFloor between 0 and 1, exclusive; got ${String(floor)}`
    );
  }
  return floor;
}

/** An exponential envelope as scheduled: floor, up to the peak, down to sustain. */
interface ExponentialEnvelope {
  start: number;
  attackEnd: number;
  decayEnd: number;
  floor: number;
  peak: number;
  sustain: number;
}

/**
 * The level of an exponential envelope at time `t`, computed the way Web Audio
 * computes an exponential ramp: v0 * (v1 / v0) ^ ((t - t0) / (t1 - t0)).
 */
function exponentialLevelAt(e: ExponentialEnvelope, t: number): number {
  const ramp = (v0: number, v1: number, t0: number, t1: number) =>
    t1 <= t0 ? v1 : v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
  if (t <= e.start) return e.floor;
  if (t < e.attackEnd) return ramp(e.floor, e.peak, e.start, e.attackEnd);
  if (t < e.decayEnd) return ramp(e.peak, e.sustain, e.attackEnd, e.decayEnd);
  return e.sustain;
}
