/** Oscillator waveform shape. Controls the tonal character of the sound. */
export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** Filter mode. Controls which part of the frequency spectrum passes through. */
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

/** Which signal the LFO modulates. */
export type LfoTarget = 'filter' | 'pitch';

/**
 * Full set of synthesis parameters for a single instrument voice.
 *
 * All continuous values use a **normalized 0–1 range** which the engine maps
 * to perceptually useful ranges internally (e.g. `filterCutoff` → 20 Hz–20 kHz).
 */
export interface InstrumentParams {
  /** Oscillator waveform shape. */
  waveform: Waveform;
  /**
   * Pitch offset applied on top of the note's MIDI pitch, in semitones.
   * Range: -24 to +24 (two octaves up or down).
   */
  pitchOffset: number;

  // ── ADSR Envelope ────────────────────────────────────────────────────────
  /**
   * Time to reach peak amplitude after a note-on event (normalized 0–1).
   * Mapped internally to a range of ~1 ms – 2 s.
   */
  attack: number;
  /**
   * Time to fall from peak to the sustain level after attack ends (normalized 0–1).
   * Mapped internally to a range of ~5 ms – 2 s.
   */
  decay: number;
  /**
   * Amplitude held while the note is sustained (normalized 0–1).
   * A value of `1` holds at full attack peak; `0` drops to silence immediately after decay.
   */
  sustain: number;
  /**
   * Time to fade to silence after a note-off event (normalized 0–1).
   * Mapped internally to a range of ~10 ms – 4 s.
   */
  release: number;

  // ── Filter ───────────────────────────────────────────────────────────────
  /**
   * Filter mode. Controls which part of the frequency spectrum passes through.
   * Defaults to `'lowpass'` when omitted.
   */
  filterType?: FilterType;
  /**
   * Filter cutoff frequency (normalized 0–1).
   * Mapped internally to 20 Hz – 20 kHz. Lower values produce a darker, muffled tone.
   */
  filterCutoff: number;
  /**
   * Filter resonance / Q factor (normalized 0–1).
   * Mapped internally to Q 0.5 – 20. Higher values create a pronounced peak at the cutoff.
   */
  filterResonance: number;

  // ── Effects ──────────────────────────────────────────────────────────────
  /**
   * Delay effect time (normalized 0–1).
   * Mapped internally to 0 – 1 second.
   */
  delayTime: number;
  /**
   * Delay feedback amount (normalized 0–1).
   * Controls how much of the delayed signal is fed back into the delay line.
   * Internally capped at 0.9 to prevent runaway feedback.
   */
  delayFeedback: number;
  /**
   * Dry/wet mix for the delay effect (normalized 0–1).
   * `0` = fully dry (no delay), `1` = fully wet (100% delay signal).
   */
  delayMix: number;
  /**
   * Soft-clipping distortion amount (normalized 0–1).
   * `0` = clean, `1` = heavily saturated.
   */
  distortion: number;
  /**
   * Reverb wet mix (normalized 0–1).
   * `0` = dry (no reverb), `1` = fully wet. Uses an algorithmic room impulse response.
   * Defaults to `0` when omitted.
   */
  reverbMix?: number;

  // ── LFO ──────────────────────────────────────────────────────────────────
  /**
   * LFO speed (normalized 0–1). Mapped internally to 0.1 Hz – 20 Hz.
   * Defaults to `0.3` (~3 Hz) when omitted.
   */
  lfoRate?: number;
  /**
   * LFO modulation depth (normalized 0–1). `0` disables the LFO entirely.
   * For `filter` target: mapped to 0–4000 Hz sweep. For `pitch`: 0–100 cents.
   * Defaults to `0` when omitted.
   */
  lfoDepth?: number;
  /**
   * Which parameter the LFO modulates. `'filter'` sweeps the cutoff (wah/autowah);
   * `'pitch'` adds vibrato. Defaults to `'filter'` when omitted.
   */
  lfoTarget?: LfoTarget;

  // ── Unison ───────────────────────────────────────────────────────────────
  /**
   * Second-oscillator detune spread (normalized 0–1). Mapped to 0–50 cents.
   * `0` = mono (single oscillator). Any value > 0 adds a second oscillator
   * detuned symmetrically around the fundamental for a fatter, wider sound.
   * Defaults to `0` when omitted.
   */
  unisonDetune?: number;

  // ── Dynamics ─────────────────────────────────────────────────────────────
  /**
   * How strongly MIDI velocity affects the output volume (normalized 0–1).
   * `0` = velocity has no effect (all notes play at full volume);
   * `1` = velocity linearly scales amplitude from silence to full.
   */
  velocityResponse: number;
}

/** A named snapshot of {@link InstrumentParams} that can be assigned to tracks. */
export interface InstrumentPreset {
  /** Unique identifier used to reference this preset from tracks. */
  id: string;
  /** Human-readable name shown in preset lists and pickers. */
  name: string;
  /** The synthesis parameters that define the sound of this preset. */
  params: InstrumentParams;
  /** `true` if this preset is shipped with the engine; `false` if user-created. */
  isBuiltIn: boolean;
}

export const defaultInstrumentParams: InstrumentParams = {
  waveform: 'sawtooth',
  pitchOffset: 0,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
  filterType: 'lowpass',
  filterCutoff: 0.8,
  filterResonance: 0.1,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  reverbMix: 0,
  lfoRate: 0.3,
  lfoDepth: 0,
  lfoTarget: 'filter',
  unisonDetune: 0,
  velocityResponse: 0.5,
};
