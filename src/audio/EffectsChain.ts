import { normalizedToDelayTime } from '../utils/time';

export interface EffectsParams {
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  distortion: number;
}

/**
 * Effects chain: Delay -> Distortion
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

    // Set up routing
    // Dry path: input -> dryGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: input -> delay -> distortion -> wetGain -> output
    this.input.connect(this.delayNode);
    this.delayNode.connect(this.distortionNode);
    this.distortionNode.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Feedback loop: delay -> feedbackGain -> delay
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    // Initialize with default values
    this.setParams({
      delayTime: 0,
      delayFeedback: 0,
      delayMix: 0,
      distortion: 0,
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
    this.feedbackGain.gain.setValueAtTime(params.delayFeedback * 0.9, now); // Cap at 0.9 to prevent runaway

    // Dry/wet mix
    this.dryGain.gain.setValueAtTime(1 - params.delayMix, now);
    this.wetGain.gain.setValueAtTime(params.delayMix, now);

    // Distortion
    this.distortionNode.curve = this.makeDistortionCurve(params.distortion);
    this.distortionNode.oversample = '2x';
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const k = amount * 100;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      if (k === 0) {
        curve[i] = x;
      } else {
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
      }
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
    this.output.disconnect();
  }
}
