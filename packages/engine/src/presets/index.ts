import type { InstrumentPreset, InstrumentParams } from '../types';
import { defaultInstrumentParams } from '../types';

function createPreset(
  id: string,
  name: string,
  overrides: Partial<InstrumentParams>
): InstrumentPreset {
  return {
    id,
    name,
    params: { ...defaultInstrumentParams, ...overrides },
    isBuiltIn: true,
  };
}

export const bassPreset = createPreset('bass', 'Bass', {
  waveform: 'sawtooth',
  pitchOffset: -12,
  attack: 0.01,
  decay: 0.2,
  sustain: 0.6,
  release: 0.2,
  filterCutoff: 0.3,
  filterResonance: 0.2,
  delayMix: 0,
  distortion: 0.1,
  velocityResponse: 0.4,
});

export const leadPreset = createPreset('lead', 'Lead', {
  waveform: 'square',
  pitchOffset: 0,
  attack: 0.02,
  decay: 0.15,
  sustain: 0.7,
  release: 0.3,
  filterCutoff: 0.6,
  filterResonance: 0.3,
  delayTime: 0.3,
  delayFeedback: 0.4,
  delayMix: 0.25,
  distortion: 0.05,
  velocityResponse: 0.6,
});

export const padPreset = createPreset('pad', 'Pad', {
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0.4,
  decay: 0.3,
  sustain: 0.8,
  release: 0.6,
  filterCutoff: 0.5,
  filterResonance: 0.1,
  delayTime: 0.5,
  delayFeedback: 0.5,
  delayMix: 0.35,
  distortion: 0,
  velocityResponse: 0.3,
});

export const keysPreset = createPreset('keys', 'Keys', {
  waveform: 'triangle',
  pitchOffset: 0,
  attack: 0.005,
  decay: 0.4,
  sustain: 0.3,
  release: 0.4,
  filterCutoff: 0.7,
  filterResonance: 0.1,
  delayTime: 0.15,
  delayFeedback: 0.2,
  delayMix: 0.15,
  distortion: 0,
  velocityResponse: 0.8,
});

export const pluckPreset = createPreset('pluck', 'Pluck', {
  waveform: 'sawtooth',
  pitchOffset: 0,
  attack: 0.001,
  decay: 0.3,
  sustain: 0.1,
  release: 0.2,
  filterCutoff: 0.8,
  filterResonance: 0.4,
  delayTime: 0.2,
  delayFeedback: 0.3,
  delayMix: 0.2,
  distortion: 0,
  velocityResponse: 0.7,
});

export const percussionPreset = createPreset('percussion', 'Percussion', {
  waveform: 'square',
  pitchOffset: 0,
  attack: 0.001,
  decay: 0.1,
  sustain: 0,
  release: 0.05,
  filterCutoff: 0.9,
  filterResonance: 0.2,
  delayMix: 0,
  distortion: 0.4,
  velocityResponse: 0.9,
});

export const pianoPreset = createPreset('piano', 'Piano', {
  waveform: 'triangle',
  pitchOffset: 0,
  attack: 0.002,
  decay: 0.5,
  sustain: 0.1,
  release: 0.6,
  filterCutoff: 0.85,
  filterResonance: 0.05,
  delayTime: 0.1,
  delayFeedback: 0.1,
  delayMix: 0.08,
  distortion: 0,
  velocityResponse: 0.9,
});

export const organPreset = createPreset('organ', 'Organ', {
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0.001,
  decay: 0.0,
  sustain: 1.0,
  release: 0.05,
  filterCutoff: 0.6,
  filterResonance: 0.05,
  delayTime: 0.3,
  delayFeedback: 0.2,
  delayMix: 0.1,
  distortion: 0.05,
  velocityResponse: 0.2,
});

export const stringsPreset = createPreset('strings', 'Strings', {
  waveform: 'sawtooth',
  pitchOffset: 0,
  attack: 0.35,
  decay: 0.2,
  sustain: 0.85,
  release: 0.8,
  filterCutoff: 0.35,
  filterResonance: 0.1,
  delayTime: 0.4,
  delayFeedback: 0.35,
  delayMix: 0.25,
  distortion: 0,
  velocityResponse: 0.5,
});

export const bellPreset = createPreset('bell', 'Bell', {
  waveform: 'triangle',
  pitchOffset: 12,
  attack: 0.001,
  decay: 0.8,
  sustain: 0.0,
  release: 1.0,
  filterCutoff: 0.95,
  filterResonance: 0.15,
  delayTime: 0.35,
  delayFeedback: 0.45,
  delayMix: 0.3,
  distortion: 0,
  velocityResponse: 0.8,
});

export const marimbaPreset = createPreset('marimba', 'Marimba', {
  waveform: 'triangle',
  pitchOffset: 0,
  attack: 0.001,
  decay: 0.35,
  sustain: 0.05,
  release: 0.1,
  filterCutoff: 0.9,
  filterResonance: 0.05,
  delayTime: 0.15,
  delayFeedback: 0.15,
  delayMix: 0.1,
  distortion: 0,
  velocityResponse: 0.85,
});

export const builtInPresets: InstrumentPreset[] = [
  bassPreset,
  leadPreset,
  padPreset,
  keysPreset,
  pluckPreset,
  percussionPreset,
  pianoPreset,
  organPreset,
  stringsPreset,
  bellPreset,
  marimbaPreset,
];

export function getPresetById(presets: InstrumentPreset[], id: string): InstrumentPreset | undefined {
  return presets.find((p) => p.id === id);
}
