import { useState } from 'react';
import { useSoundscape } from '../../state';
import { Slider, Select } from '../common';
import { WaveformVisualizer } from '../WaveformVisualizer/WaveformVisualizer';
import type { Track, InstrumentParams, InstrumentPreset, Waveform, FilterType, LfoTarget } from 'soundscape-engine';
import { getPresetById } from 'soundscape-engine';
import './InstrumentPanel.css';

interface InstrumentPanelProps {
  track: Track | null;
  analyserNode: AnalyserNode | null;
}

const waveformOptions = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
];

const filterTypeOptions = [
  { value: 'lowpass', label: 'Low Pass' },
  { value: 'highpass', label: 'High Pass' },
  { value: 'bandpass', label: 'Band Pass' },
  { value: 'notch', label: 'Notch' },
];

const lfoTargetOptions = [
  { value: 'filter', label: 'Filter (Wah)' },
  { value: 'pitch', label: 'Pitch (Vibrato)' },
];

export function InstrumentPanel({ track, analyserNode }: InstrumentPanelProps) {
  const { state, dispatch, previewNote } = useSoundscape();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

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

  const downloadPresetJson = (preset: InstrumentPreset) => {
    const blob = new Blob([JSON.stringify(preset, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name.toLowerCase().replace(/\s+/g, '-')}.preset.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveAsPreset = () => {
    const name = savePresetName.trim();
    if (!name) return;
    const newPreset: InstrumentPreset = {
      id: crypto.randomUUID(),
      name,
      params: { ...params },
      isBuiltIn: false,
    };
    dispatch({ type: 'ADD_PRESET', payload: newPreset });
    downloadPresetJson(newPreset);
    setShowSaveForm(false);
    setSavePresetName('');
  };

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
    const filterTypes: FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
    const lfoTargets: LfoTarget[] = ['filter', 'pitch'];
    const randomFloat = (min: number, max: number) => Math.random() * (max - min) + min;
    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Non-null assertions are safe: randomInt bounds are [0, array.length - 1]
    const overrides: Partial<InstrumentParams> = {
      waveform: waveforms[randomInt(0, waveforms.length - 1)]!,
      pitchOffset: randomInt(-24, 24),
      attack: randomFloat(0, 1),
      decay: randomFloat(0, 1),
      sustain: randomFloat(0, 1),
      release: randomFloat(0, 1),
      filterType: filterTypes[randomInt(0, filterTypes.length - 1)]!,
      filterCutoff: randomFloat(0, 1),
      filterResonance: randomFloat(0, 1),
      delayTime: randomFloat(0, 1),
      delayFeedback: randomFloat(0, 0.8),
      delayMix: randomFloat(0, 1),
      distortion: randomFloat(0, 1),
      reverbMix: randomFloat(0, 0.6),
      lfoRate: randomFloat(0, 1),
      lfoDepth: randomFloat(0, 0.5),
      lfoTarget: lfoTargets[randomInt(0, lfoTargets.length - 1)]!,
      unisonDetune: randomFloat(0, 0.5),
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
          {showSaveForm ? (
            <div className="save-preset-form">
              <input
                type="text"
                className="save-preset-input"
                value={savePresetName}
                placeholder="Preset name…"
                autoFocus
                onChange={(e) => setSavePresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveAsPreset();
                  if (e.key === 'Escape') {
                    setShowSaveForm(false);
                    setSavePresetName('');
                  }
                }}
              />
              <button className="save-preset-confirm-btn" onClick={handleSaveAsPreset}>
                Save
              </button>
              <button
                className="save-preset-cancel-btn"
                onClick={() => { setShowSaveForm(false); setSavePresetName(''); }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button className="save-preset-btn" onClick={() => setShowSaveForm(true)}>
                Save as Preset
              </button>
              <button className="randomize-btn" onClick={handleRandomize}>
                Randomize
              </button>
              <button className="preview-btn" onClick={handlePreview}>
                Preview
              </button>
            </>
          )}
        </div>
      </div>

      <WaveformVisualizer analyserNode={analyserNode} />

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
          <Slider
            label="Unison Detune"
            tooltip="Adds a second oscillator detuned by up to ±25 cents for a fatter, wider sound. 0 = mono."
            value={params.unisonDetune ?? 0}
            onChange={(v) => handleParamChange('unisonDetune', v)}
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
          <Select
            label="Type"
            tooltip="Lowpass lets lows through, Highpass lets highs through, Bandpass isolates a frequency band, Notch scoops out a band."
            value={params.filterType ?? 'lowpass'}
            options={filterTypeOptions}
            onChange={(v) => handleParamChange('filterType', v as FilterType)}
          />
          <Slider
            label="Cutoff"
            tooltip="Controls the filter's center frequency. Lower values create a darker, muffled sound (lowpass) or brighter sound (highpass)."
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
          <h4>LFO</h4>
          <Select
            label="Target"
            tooltip="What the LFO modulates: Filter creates a wah/autowah effect; Pitch creates vibrato."
            value={params.lfoTarget ?? 'filter'}
            options={lfoTargetOptions}
            onChange={(v) => handleParamChange('lfoTarget', v as LfoTarget)}
          />
          <Slider
            label="Rate"
            tooltip="How fast the LFO oscillates (0.1 Hz–20 Hz). Low = slow sweep, high = fast wobble."
            value={params.lfoRate ?? 0.3}
            onChange={(v) => handleParamChange('lfoRate', v)}
          />
          <Slider
            label="Depth"
            tooltip="How strongly the LFO affects the target. 0 disables the LFO entirely."
            value={params.lfoDepth ?? 0}
            onChange={(v) => handleParamChange('lfoDepth', v)}
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
            label="Reverb Mix"
            tooltip="Blends in a room reverb effect. Higher values create a more spacious, ambient sound."
            value={params.reverbMix ?? 0}
            onChange={(v) => handleParamChange('reverbMix', v)}
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
