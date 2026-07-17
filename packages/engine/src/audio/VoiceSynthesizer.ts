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
}

/**
 * A single polyphonic voice: one or two oscillators routed through an ADSR gain
 * envelope and a configurable filter, with optional LFO modulation.
 *
 * Voices are pooled per track by {@link AudioEngine} (up to 8 per track).
 * When all voices are busy, the oldest voice is stolen via {@link stop}.
 */
export class VoiceSynthesizer {
  private context: AudioContext;
  private oscillators: OscillatorNode[] = [];
  private lfoNode: OscillatorNode | null = null;
  private lfoGainNode: GainNode | null = null;
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;
  private output: GainNode;
  private isPlaying = false;
  private releaseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(context: AudioContext, outputNode: AudioNode) {
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

    // Apply pitch offset
    const adjustedPitch = applyPitchOffset(pitch, instrument.pitchOffset);
    const frequency = midiToFrequency(adjustedPitch);

    // Unison: 1 oscillator when unisonDetune === 0, 2 when > 0
    const detuneCents = (instrument.unisonDetune ?? 0) * 50;
    const oscCount = detuneCents > 0 ? 2 : 1;

    this.oscillators = Array.from({ length: oscCount }, (_, i) => {
      const osc = this.context.createOscillator();
      osc.type = instrument.waveform as OscillatorType;
      osc.frequency.setValueAtTime(frequency, scheduleTime);
      if (oscCount === 2) {
        osc.detune.setValueAtTime(i === 0 ? -detuneCents / 2 : detuneCents / 2, scheduleTime);
      }
      osc.connect(this.gainNode);
      osc.start(scheduleTime);
      return osc;
    });

    // Set filter parameters
    this.filterNode.type = (instrument.filterType ?? 'lowpass') as BiquadFilterType;
    this.filterNode.frequency.setValueAtTime(
      normalizedToFilterFreq(instrument.filterCutoff),
      scheduleTime
    );
    this.filterNode.Q.setValueAtTime(normalizedToQ(instrument.filterResonance), scheduleTime);

    // LFO modulation
    const lfoDepth = instrument.lfoDepth ?? 0;
    if (lfoDepth > 0) {
      const lfoRate = normalizedToLfoRate(instrument.lfoRate ?? 0.3);
      const lfoTarget = instrument.lfoTarget ?? 'filter';

      this.lfoNode = this.context.createOscillator();
      this.lfoGainNode = this.context.createGain();

      this.lfoNode.type = 'sine';
      this.lfoNode.frequency.setValueAtTime(lfoRate, scheduleTime);

      if (lfoTarget === 'filter') {
        this.lfoGainNode.gain.setValueAtTime(
          normalizedToLfoFilterDepth(lfoDepth),
          scheduleTime
        );
        this.lfoNode.connect(this.lfoGainNode);
        this.lfoGainNode.connect(this.filterNode.frequency);
      } else {
        // pitch vibrato — modulate detune on all oscillators
        this.lfoGainNode.gain.setValueAtTime(
          normalizedToLfoPitchDepth(lfoDepth),
          scheduleTime
        );
        this.lfoNode.connect(this.lfoGainNode);
        for (const osc of this.oscillators) {
          this.lfoGainNode.connect(osc.detune);
        }
      }

      this.lfoNode.start(scheduleTime);
    }

    // Calculate velocity-adjusted amplitude
    const normalizedVelocity = velocity / 127;
    const velocityScale = 1 - instrument.velocityResponse + instrument.velocityResponse * normalizedVelocity;
    const maxAmplitude = 0.3 * velocityScale; // Keep reasonable volume

    // ADSR envelope
    const attackTime = normalizedToADSR(instrument.attack, 'attack');
    const decayTime = normalizedToADSR(instrument.decay, 'decay');
    const sustainLevel = instrument.sustain * maxAmplitude;

    // Cancel any scheduled values and set to 0
    this.gainNode.gain.cancelScheduledValues(scheduleTime);
    this.gainNode.gain.setValueAtTime(0, scheduleTime);

    // Attack
    this.gainNode.gain.linearRampToValueAtTime(maxAmplitude, scheduleTime + attackTime);

    // Decay to sustain
    this.gainNode.gain.linearRampToValueAtTime(sustainLevel, scheduleTime + attackTime + decayTime);

    this.isPlaying = true;
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
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(scheduleTime);
    } else {
      // Firefox has no cancelAndHoldAtTime — approximate with the current
      // value; mid-envelope releases may start from a slightly stale level
      const currentGain = gain.value;
      gain.cancelScheduledValues(scheduleTime);
      gain.setValueAtTime(currentGain, scheduleTime);
    }

    // Release envelope
    gain.linearRampToValueAtTime(0, scheduleTime + releaseTime);

    // Stop oscillators and LFO after release
    const oscs = [...this.oscillators];
    const releaseEnd = scheduleTime + releaseTime + 0.01;
    for (const osc of oscs) {
      osc.stop(releaseEnd);
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
