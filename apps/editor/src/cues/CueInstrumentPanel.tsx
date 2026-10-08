import { useId } from 'react';
import type { Dispatch, ReactNode } from 'react';
import {
  normalizedToADSR,
  normalizedToDelayTime,
  normalizedToFilterFreq,
  normalizedToLfoRate,
} from 'soundscape-engine';
import type { CueDocument, CueInstrument, CueProblem } from 'soundscape-engine';
import { ExactField } from './ExactField';
import { dbfs, msReadout } from './readouts';
import type { CueAction } from './state';

interface CueInstrumentPanelProps {
  doc: CueDocument;
  name: string;
  problems: CueProblem[];
  dispatch: Dispatch<CueAction>;
}

type Changes = Record<string, number | string | boolean | undefined>;

// What a fixed decay starts at, and a new exponential envelope's floor, -80 dBFS
const FIXED_DECAY = 0.2;
const NEW_FLOOR = 0.0001;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * A cue instrument's fields, sharing the song panel's look but not its
 * components: exact fields rather than sliders, the decay as a fixed length
 * or until each note's release, the envelope's curve and floor, a filter
 * that can be None, the fields a cue holds at zero as text, and no
 * Randomize, which would make an instrument a cue cannot have.
 */
export function CueInstrumentPanel({ doc, name, problems, dispatch }: CueInstrumentPanelProps) {
  const ins = doc.instruments[name]!;
  const headingId = useId();
  const change = (changes: Changes) => dispatch({ type: 'SET_INSTRUMENT', name, changes });
  const problemsAt = (key: string) => problems.filter((p) => p.path === `instruments.${name}.${key}`).map((p) => p.message);
  const usedBy = Object.values(doc.cues).filter((c) => c.notes.some((n) => n.instrument === name)).length;

  const field = (
    key: keyof CueInstrument,
    label: string,
    unit: string | null,
    readout?: ReactNode,
    steps: { step: number; bigStep: number; min?: number } = { step: 0.01, bigStep: 0.1, min: 0 }
  ) => (
    <ExactField
      id={`instrument-${name}-${key}`}
      name={`${label} of instrument ${name}${unit ? `, ${unit}` : ''}`}
      label={label}
      value={ins[key] as number}
      {...steps}
      {...(readout !== undefined && { readout })}
      problems={problemsAt(key)}
      onCommit={(v) => change({ [key]: v })}
    />
  );

  const choice = (key: string, label: string, value: string, options: [string, string][], onChange: (v: string) => void) => (
    <div className="exact-field">
      <label className="exact-label" htmlFor={`instrument-${name}-${key}`}>
        {label}
      </label>
      <select
        id={`instrument-${name}-${key}`}
        className="cue-select"
        aria-label={`${label} of instrument ${name}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );

  const untilRelease = ins.decayUntilRelease === true;
  const filterOff = ins.filterType === 'none';
  const unused = 'unused while the filter is None';

  return (
    <section className="cue-panel cue-instrument" aria-labelledby={headingId}>
      <h2 id={headingId}>
        Instrument {name}
        <span className="cue-muted">, used by {plural(usedBy, 'cue')} in this file</span>
      </h2>
      <div className="cue-instrument-sections">
        <fieldset className="cue-instrument-section">
          <legend>Oscillator</legend>
          {choice('waveform', 'Waveform', ins.waveform, [
            ['sine', 'Sine'],
            ['square', 'Square'],
            ['sawtooth', 'Sawtooth'],
            ['triangle', 'Triangle'],
          ], (v) => change({ waveform: v }))}
          {field('pitchOffset', 'Pitch offset', 'semitones', undefined, { step: 1, bigStep: 12, min: -24 })}
          {field('unisonDetune', 'Unison detune', 'normalized', ins.unisonDetune === 0 ? 'one oscillator' : undefined)}
        </fieldset>

        <fieldset className="cue-instrument-section">
          <legend>Envelope</legend>
          {field('attack', 'Attack', 'normalized', msReadout(normalizedToADSR(ins.attack, 'attack')))}
          <fieldset className="cue-radio-group">
            <legend className="exact-label">Decay</legend>
            <label className="cue-radio">
              <input
                type="radio"
                name={`instrument-${name}-decay-kind`}
                checked={!untilRelease}
                onChange={() => change({ decayUntilRelease: undefined, decay: FIXED_DECAY })}
              />
              Fixed length
            </label>
            <label className="cue-radio">
              <input
                type="radio"
                name={`instrument-${name}-decay-kind`}
                checked={untilRelease}
                onChange={() => change({ decay: undefined, decayUntilRelease: true })}
              />
              Until each note&apos;s release
            </label>
          </fieldset>
          {!untilRelease && field('decay', 'Decay', 'normalized', msReadout(normalizedToADSR(ins.decay ?? 0, 'decay')))}
          {field('sustain', 'Sustain', 'of the peak')}
          {field('release', 'Release', 'normalized', msReadout(normalizedToADSR(ins.release, 'release')))}
          {choice('envelopeCurve', 'Curve', ins.envelopeCurve, [
            ['linear', 'Linear'],
            ['exponential', 'Exponential'],
          ], (v) => {
            if (v === ins.envelopeCurve) return;
            // The floor exists exactly when the curve is exponential
            change({ envelopeCurve: v, envelopeFloor: v === 'exponential' ? NEW_FLOOR : undefined });
          })}
          {ins.envelopeCurve === 'exponential' &&
            field('envelopeFloor', 'Floor', null, dbfs(ins.envelopeFloor ?? 0), { step: 0.000001, bigStep: 0.00001, min: 0.000001 })}
        </fieldset>

        <fieldset className="cue-instrument-section">
          <legend>Filter</legend>
          {choice('filterType', 'Filter', ins.filterType, [
            ['none', 'None'],
            ['lowpass', 'Low pass'],
            ['highpass', 'High pass'],
            ['bandpass', 'Band pass'],
            ['notch', 'Notch'],
          ], (v) => change({ filterType: v }))}
          {field('filterCutoff', 'Cutoff', 'normalized', filterOff ? unused : `${normalizedToFilterFreq(ins.filterCutoff).toFixed(1)} Hz`)}
          {field('filterResonance', 'Resonance', 'normalized', filterOff ? unused : undefined)}
        </fieldset>

        <fieldset className="cue-instrument-section">
          <legend>LFO</legend>
          {choice('lfoTarget', 'LFO target', ins.lfoTarget, [
            ['pitch', 'Pitch'],
            ['filter', 'Filter'],
          ], (v) => change({ lfoTarget: v }))}
          {field('lfoRate', 'LFO rate', 'normalized', `${normalizedToLfoRate(ins.lfoRate).toFixed(2)} Hz`)}
          {field('lfoDepth', 'LFO depth', 'normalized', ins.lfoDepth === 0 ? 'off' : undefined)}
        </fieldset>

        <fieldset className="cue-instrument-section">
          <legend>Delay and drive</legend>
          {field('delayTime', 'Delay time', 'normalized', msReadout(normalizedToDelayTime(ins.delayTime)))}
          {field('delayFeedback', 'Delay feedback', 'normalized')}
          {field('delayMix', 'Delay mix', 'normalized', ins.delayMix === 0 ? 'dry' : undefined)}
          {field('distortion', 'Distortion', 'normalized')}
        </fieldset>

        <section className="cue-instrument-section" aria-label="Fixed for cues">
          <h3 className="exact-label">Fixed for cues</h3>
          <p className="cue-fixed">Reverb mix: 0. The reverb is random, and a cue sounds the same every time.</p>
          <p className="cue-fixed">Velocity response: 0. A note&apos;s level is its peak.</p>
        </section>
      </div>
    </section>
  );
}
