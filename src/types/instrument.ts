export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface InstrumentParams {
  waveform: Waveform;
  pitchOffset: number; // semitones offset (-24 to +24)

  // ADSR envelope (all 0-1, mapped to useful ranges)
  attack: number;
  decay: number;
  sustain: number;
  release: number;

  // Filter
  filterCutoff: number; // 0-1, mapped to 20Hz-20kHz
  filterResonance: number; // 0-1, mapped to Q 0.5-20

  // Effects
  delayTime: number; // 0-1, mapped to 0-1 second
  delayFeedback: number; // 0-1
  delayMix: number; // 0-1 (dry/wet)
  distortion: number; // 0-1

  // Dynamics
  velocityResponse: number; // 0-1, how much velocity affects volume
}

export interface InstrumentPreset {
  id: string;
  name: string;
  params: InstrumentParams;
  isBuiltIn: boolean;
}

export const defaultInstrumentParams: InstrumentParams = {
  waveform: 'sawtooth',
  pitchOffset: 0,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
  filterCutoff: 0.8,
  filterResonance: 0.1,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  velocityResponse: 0.5,
};
