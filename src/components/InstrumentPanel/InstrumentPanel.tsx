import { useSoundscape } from '../../state';
import { Slider, Select } from '../common';
import type { Track, InstrumentParams, Waveform } from '../../types';
import { getPresetById } from '../../presets';
import './InstrumentPanel.css';

interface InstrumentPanelProps {
  track: Track | null;
}

const waveformOptions = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
];

export function InstrumentPanel({ track }: InstrumentPanelProps) {
  const { state, dispatch, previewNote } = useSoundscape();

  if (!track) {
    return (
      <div className="instrument-panel instrument-panel-empty">
        <p>Select a track to edit instrument</p>
      </div>
    );
  }

  const preset = getPresetById(state.presets, track.presetId);
  if (!preset) {
    return (
      <div className="instrument-panel instrument-panel-empty">
        <p>Unknown preset</p>
      </div>
    );
  }

  const params = { ...preset.params, ...track.paramOverrides };

  const handleParamChange = (key: keyof InstrumentParams, value: number | string) => {
    const overrides = { ...track.paramOverrides, [key]: value };
    dispatch({
      type: 'SET_TRACK_PARAM_OVERRIDES',
      payload: { trackId: track.id, overrides },
    });
  };

  const handlePreview = () => {
    previewNote(60, 100, track.presetId, track.paramOverrides);
  };

  const handleRandomize = () => {
    const waveforms: Waveform[] = ['sine', 'square', 'sawtooth', 'triangle'];
    const randomFloat = (min: number, max: number) => Math.random() * (max - min) + min;
    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const overrides: Partial<InstrumentParams> = {
      waveform: waveforms[randomInt(0, waveforms.length - 1)],
      pitchOffset: randomInt(-24, 24),
      attack: randomFloat(0, 1),
      decay: randomFloat(0, 1),
      sustain: randomFloat(0, 1),
      release: randomFloat(0, 1),
      filterCutoff: randomFloat(0, 1),
      filterResonance: randomFloat(0, 1),
      delayTime: randomFloat(0, 1),
      delayFeedback: randomFloat(0, 0.8),
      delayMix: randomFloat(0, 1),
      distortion: randomFloat(0, 1),
      velocityResponse: randomFloat(0, 1),
    };

    dispatch({
      type: 'SET_TRACK_PARAM_OVERRIDES',
      payload: { trackId: track.id, overrides },
    });
  };

  return (
    <div className="instrument-panel">
      <div className="instrument-panel-header">
        <h3>
          Instrument - {track.name}
          {!track.paramOverrides || Object.keys(track.paramOverrides).length === 0
            ? ` - ${preset.name}`
            : ''}
        </h3>
        <div className="instrument-panel-actions">
        <button className="randomize-btn" onClick={handleRandomize}>
            Randomize
          </button>          
          <button className="preview-btn" onClick={handlePreview}>
            Preview
          </button>
        </div>
      </div>

      <div className="instrument-params">
        <div className="param-section">
          <h4>Oscillator</h4>
          <Select
            label="Waveform"
            tooltip="The basic shape of the sound wave that determines the tone character."
            value={params.waveform}
            options={waveformOptions}
            onChange={(v) => handleParamChange('waveform', v as Waveform)}
          />
          <Slider
            label="Pitch Offset"
            tooltip="Shifts all notes up or down by semitones."
            value={params.pitchOffset}
            min={-24}
            max={24}
            step={1}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v}`}
            onChange={(v) => handleParamChange('pitchOffset', v)}
          />
        </div>

        <div className="param-section">
          <h4>Envelope (ADSR)</h4>
          <Slider
            label="Attack"
            tooltip="How quickly the sound reaches full volume when a note starts."
            value={params.attack}
            onChange={(v) => handleParamChange('attack', v)}
          />
          <Slider
            label="Decay"
            tooltip="How quickly the sound drops from peak to sustain level."
            value={params.decay}
            onChange={(v) => handleParamChange('decay', v)}
          />
          <Slider
            label="Sustain"
            tooltip="The volume level held while a note is pressed."
            value={params.sustain}
            onChange={(v) => handleParamChange('sustain', v)}
          />
          <Slider
            label="Release"
            tooltip="How long the sound fades out after a note ends."
            value={params.release}
            onChange={(v) => handleParamChange('release', v)}
          />
        </div>

        <div className="param-section">
          <h4>Filter</h4>
          <Slider
            label="Cutoff"
            tooltip="Controls which frequencies pass through; lower values create a darker, muffled sound."
            value={params.filterCutoff}
            onChange={(v) => handleParamChange('filterCutoff', v)}
          />
          <Slider
            label="Resonance"
            tooltip="Boosts frequencies near the cutoff point for a more pronounced, sharper tone."
            value={params.filterResonance}
            onChange={(v) => handleParamChange('filterResonance', v)}
          />
        </div>

        <div className="param-section">
          <h4>Delay</h4>
          <Slider
            label="Time"
            tooltip="The gap between each echo repeat."
            value={params.delayTime}
            onChange={(v) => handleParamChange('delayTime', v)}
          />
          <Slider
            label="Feedback"
            tooltip="How many times the echo repeats before fading out."
            value={params.delayFeedback}
            onChange={(v) => handleParamChange('delayFeedback', v)}
          />
          <Slider
            label="Mix"
            tooltip="The volume balance between the dry signal and the delayed echo."
            value={params.delayMix}
            onChange={(v) => handleParamChange('delayMix', v)}
          />
        </div>

        <div className="param-section">
          <h4>Effects</h4>
          <Slider
            label="Distortion"
            tooltip="Adds grit and harmonic crunch to the sound."
            value={params.distortion}
            onChange={(v) => handleParamChange('distortion', v)}
          />
          <Slider
            label="Velocity Resp."
            tooltip="How much note velocity affects the volume and brightness."
            value={params.velocityResponse}
            onChange={(v) => handleParamChange('velocityResponse', v)}
          />
        </div>
      </div>
    </div>
  );
}
