import type { InstrumentParams } from '../types';
import { midiToFrequency, normalizedToFilterFreq, normalizedToQ, applyPitchOffset } from '../utils/pitch';
import { normalizedToADSR } from '../utils/time';

export interface VoiceParams {
  pitch: number; // MIDI note
  velocity: number; // 0-127
  instrument: InstrumentParams;
}

/**
 * Single voice synthesizer with oscillator, ADSR envelope, and filter
 */
export class VoiceSynthesizer {
  private context: AudioContext;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;
  private output: GainNode;
  private isPlaying = false;
  private releaseTimeout: number | null = null;

  constructor(context: AudioContext, outputNode: AudioNode) {
    this.context = context;

    // Create nodes
    this.gainNode = context.createGain();
    this.filterNode = context.createBiquadFilter();
    this.output = context.createGain();

    // Set up routing: oscillator -> gain (ADSR) -> filter -> output
    this.gainNode.connect(this.filterNode);
    this.filterNode.connect(this.output);
    this.output.connect(outputNode);

    // Initialize
    this.gainNode.gain.value = 0;
    this.filterNode.type = 'lowpass';
  }

  noteOn(params: VoiceParams, startTime: number): void {
    if (this.releaseTimeout !== null) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    // Stop any existing oscillator
    this.stop();

    const { pitch, velocity, instrument } = params;
    const now = this.context.currentTime;
    const scheduleTime = Math.max(now, startTime);

    // Create oscillator
    this.oscillator = this.context.createOscillator();
    this.oscillator.type = instrument.waveform as OscillatorType;

    // Apply pitch offset
    const adjustedPitch = applyPitchOffset(pitch, instrument.pitchOffset);
    this.oscillator.frequency.value = midiToFrequency(adjustedPitch);

    // Connect oscillator
    this.oscillator.connect(this.gainNode);

    // Set filter parameters
    this.filterNode.frequency.value = normalizedToFilterFreq(instrument.filterCutoff);
    this.filterNode.Q.value = normalizedToQ(instrument.filterResonance);

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

    // Start oscillator
    this.oscillator.start(scheduleTime);
    this.isPlaying = true;
  }

  noteOff(instrument: InstrumentParams, stopTime: number): void {
    if (!this.oscillator || !this.isPlaying) return;

    const now = this.context.currentTime;
    const scheduleTime = Math.max(now, stopTime);
    const releaseTime = normalizedToADSR(instrument.release, 'release');

    // Get current gain value for smooth release
    const currentGain = this.gainNode.gain.value;

    // Cancel future scheduled values
    this.gainNode.gain.cancelScheduledValues(scheduleTime);
    this.gainNode.gain.setValueAtTime(currentGain, scheduleTime);

    // Release envelope
    this.gainNode.gain.linearRampToValueAtTime(0, scheduleTime + releaseTime);

    // Stop oscillator after release
    const osc = this.oscillator;
    osc.stop(scheduleTime + releaseTime + 0.01);

    // Schedule cleanup
    const cleanupDelay = (scheduleTime - now + releaseTime + 0.05) * 1000;
    this.releaseTimeout = window.setTimeout(() => {
      if (this.oscillator === osc) {
        this.oscillator = null;
        this.isPlaying = false;
      }
      this.releaseTimeout = null;
    }, cleanupDelay);
  }

  stop(): void {
    if (this.releaseTimeout !== null) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        // Oscillator may already be stopped
      }
      this.oscillator = null;
    }
    this.isPlaying = false;
    this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
    this.gainNode.gain.setValueAtTime(0, this.context.currentTime);
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  disconnect(): void {
    this.stop();
    this.gainNode.disconnect();
    this.filterNode.disconnect();
    this.output.disconnect();
  }
}
