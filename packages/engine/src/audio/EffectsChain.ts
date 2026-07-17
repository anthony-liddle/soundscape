import { normalizedToDelayTime } from '../utils/time';

export interface EffectsParams {
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  distortion: number;
  reverbMix: number;
}

/**
 * Effects chain: Distortion (main path) + Delay send + Reverb send.
 *
 * Signal flow:
 * ```
 * input → distortion → dryGain (1 - delayMix) → output
 *              ↘ delay ↻ feedback → delayWetGain (delayMix) → output
 * input → convolverNode → reverbWetGain (reverbMix) → output   [additive send]
 * ```
 *
 * Distortion sits on the main path so it is audible regardless of the delay
 * mix, and delay echoes repeat the distorted signal.
 */
export class EffectsChain {
  private context: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private delayNode: DelayNode;
  private feedbackGain: GainNode;
  private distortionNode: WaveShaperNode;
  private convolverNode: ConvolverNode;
  private reverbWetGain: GainNode;
  private lastDistortionAmount: number | null = null;

  constructor(context: AudioContext) {
    this.context = context;

    // Create nodes
    this.input = context.createGain();
    this.output = context.createGain();
    this.dryGain = context.createGain();
    this.wetGain = context.createGain();
    this.delayNode = context.createDelay(2);
    this.feedbackGain = context.createGain();
    this.distortionNode = context.createWaveShaper();
    this.convolverNode = context.createConvolver();
    this.reverbWetGain = context.createGain();

    // Set up routing
    // Main path: input -> distortion -> dryGain -> output
    this.input.connect(this.distortionNode);
    this.distortionNode.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Delay send (from the distorted signal): distortion -> delay -> wetGain -> output
    this.distortionNode.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Feedback loop: delay -> feedbackGain -> delay
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    // Reverb parallel send: input -> convolver -> reverbWetGain -> output
    this.convolverNode.buffer = this.createReverbIR();
    this.input.connect(this.convolverNode);
    this.convolverNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.output);

    // Initialize with default values
    this.setParams({
      delayTime: 0,
      delayFeedback: 0,
      delayMix: 0,
      distortion: 0,
      reverbMix: 0,
    });
  }

  getInput(): AudioNode {
    return this.input;
  }

  getOutput(): AudioNode {
    return this.output;
  }

  setParams(params: EffectsParams): void {
    const now = this.context.currentTime;

    // Delay
    const delayTimeSeconds = normalizedToDelayTime(params.delayTime);
    this.delayNode.delayTime.setValueAtTime(delayTimeSeconds, now);
    this.feedbackGain.gain.setValueAtTime(params.delayFeedback * 0.9, now); // Cap at 0.9

    // Delay dry/wet mix
    this.dryGain.gain.setValueAtTime(1 - params.delayMix, now);
    this.wetGain.gain.setValueAtTime(params.delayMix, now);

    // Distortion. Only rebuild the 44100-sample curve when the amount
    // actually changes — setParams runs on every state sync. A null curve is
    // spec-defined pass-through, equivalent to the identity curve at 0.
    if (params.distortion !== this.lastDistortionAmount) {
      this.lastDistortionAmount = params.distortion;
      this.distortionNode.curve =
        params.distortion === 0 ? null : this.makeDistortionCurve(params.distortion);
      this.distortionNode.oversample = '2x';
    }

    // Reverb (additive send — independent of delay mix)
    this.reverbWetGain.gain.setValueAtTime(params.reverbMix, now);
  }

  /**
   * Generates a stereo algorithmic impulse response using exponentially-decaying
   * white noise. Produces a natural-sounding room reverb without any file loading.
   */
  private createReverbIR(duration = 2.5, decay = 2): AudioBuffer {
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }

    return buffer;
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const k = amount * 100;

    // Normalized soft-clip: curve(x) = x·(π + k) / (π + k·|x|).
    // curve(±1) = ±1 for every amount (no level jump when the knob leaves 0)
    // and the curve approaches the identity as k → 0.
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = (x * (Math.PI + k)) / (Math.PI + k * Math.abs(x));
    }

    return curve;
  }

  disconnect(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.delayNode.disconnect();
    this.feedbackGain.disconnect();
    this.distortionNode.disconnect();
    this.convolverNode.disconnect();
    this.reverbWetGain.disconnect();
    this.output.disconnect();
  }
}
