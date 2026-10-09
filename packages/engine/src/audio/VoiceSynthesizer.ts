import type { InstrumentParams } from '../types';
import type { CueInstrument } from '../cues/types';
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
  /**
   * The full instrument parameter set that defines the synthesis behaviour. A
   * cue instrument whose decay lasts until the release plays only through
   * {@link VoiceSynthesizer.playNote}, which knows when the release is.
   */
  instrument: InstrumentParams | CueInstrument;
  /**
   * The envelope's peak as an absolute linear gain. When given, it replaces the
   * voice's 0.3 ceiling scaled by velocity, so neither `velocity` nor the
   * instrument's `velocityResponse` affects the level. Cues use it.
   */
  peak?: number;
  /**
   * Set the note's frequency, detune, filter and LFO settings as the params'
   * values, rather than as automation events at its start. Only for a voice
   * that plays this one note, as a cue's voices do. The two sound the same
   * everywhere but Chrome, where an oscillator whose frequency is an event at
   * a start falling inside a render quantum begins with a different phase.
   * Hand-built Web Audio cues set values, so cues do too.
   */
  setAsValues?: boolean;
}

/**
 * A single polyphonic voice: one or two oscillators routed through an ADSR gain
 * envelope and a configurable filter, with optional LFO modulation.
 *
 * Voices are pooled per track by {@link AudioEngine} (up to 8 per track).
 * When all voices are busy, the oldest voice is stolen via {@link stop}.
 */
export class VoiceSynthesizer {
  private context: BaseAudioContext;
  private oscillators: OscillatorNode[] = [];
  private lfoNode: OscillatorNode | null = null;
  private lfoGainNode: GainNode | null = null;
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;
  private output: GainNode;
  private isPlaying = false;
  private releaseTimeout: ReturnType<typeof setTimeout> | null = null;
  /** True while the gain feeds the output directly, with no filter between. */
  private filterBypassed = false;
  /**
   * Called once the voice's oscillators have stopped, on the audio clock. Set
   * by whoever wants to release the voice's nodes after its sound has ended.
   */
  onEnded: (() => void) | null = null;
  /**
   * The envelope noteOn last scheduled and when, so a release without
   * cancelAndHoldAtTime knows its level without reading `gain.value`.
   */
  private scheduled: { shape: EnvelopeShape; start: number } | null = null;

  constructor(context: BaseAudioContext, outputNode: AudioNode) {
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
    // Before anything starts: a decay until the release needs to know when that is
    const decayTime = fixedDecayOf(params.instrument);
    if (this.releaseTimeout !== null) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    // Stop any existing oscillators/LFO
    this.stop();

    const { velocity, instrument } = params;
    const now = this.context.currentTime;
    const scheduleTime = Math.max(now, startTime);
    this.startSources(params, scheduleTime);

    // Calculate velocity-adjusted amplitude, unless an absolute peak is given
    const normalizedVelocity = velocity / 127;
    const velocityScale = 1 - instrument.velocityResponse + instrument.velocityResponse * normalizedVelocity;
    const maxAmplitude = params.peak ?? 0.3 * velocityScale; // Keep reasonable volume

    // ADSR envelope
    const attackTime = normalizedToADSR(instrument.attack, 'attack');
    const sustainLevel = instrument.sustain * maxAmplitude;

    // Cancel any scheduled values and set to 0
    this.gainNode.gain.cancelScheduledValues(scheduleTime);

    if (instrument.envelopeCurve === 'exponential' && maxAmplitude > 0) {
      // Exponential ramps cannot start from or reach zero, so the envelope runs
      // from the floor, to the peak, and back down toward the floor.
      const floor = envelopeFloorOf(instrument);
      this.gainNode.gain.setValueAtTime(floor, scheduleTime);
      this.gainNode.gain.exponentialRampToValueAtTime(maxAmplitude, scheduleTime + attackTime);
      this.gainNode.gain.exponentialRampToValueAtTime(
        Math.max(sustainLevel, floor),
        scheduleTime + attackTime + decayTime
      );
    } else {
      this.gainNode.gain.setValueAtTime(0, scheduleTime);

      // Attack
      this.gainNode.gain.linearRampToValueAtTime(maxAmplitude, scheduleTime + attackTime);

      // Decay to sustain
      this.gainNode.gain.linearRampToValueAtTime(sustainLevel, scheduleTime + attackTime + decayTime);
    }

    this.scheduled = { shape: envelopeShapeOf(params, null), start: scheduleTime };
    this.isPlaying = true;
  }

  /**
   * Plays one whole note, scheduling every part of it now: the sources' start,
   * the envelope's attack, decay, any hold at the sustain level, and release,
   * and the sources' stop. Nothing is ever cancelled, so the note cannot
   * depend on `cancelAndHoldAtTime`, on the release fallback, or on how a
   * browser cancels a ramp that ends at the cancel time. Firefox cancels one
   * that ends up to half a sample earlier, which is how notes released at
   * their decay's end lost the decay.
   *
   * For a fresh voice, as cues use: it neither stops nor clears anything
   * first. Release its nodes with {@link dispose} once it has ended.
   *
   * @param startTime - Audio-clock time the note starts; a time already past starts now.
   * @param duration - Seconds from the start to the release.
   * @returns Audio-clock time the voice's sources stop.
   */
  playNote(params: VoiceParams, startTime: number, duration: number): number {
    const start = Math.max(this.context.currentTime, startTime);
    this.startSources(params, start);

    const shape = envelopeShapeOf(params, duration);
    const gain = this.gainNode.gain;
    // Every time is the start plus a time within the note, and the plan's are
    // in order, so their order survives rounding: addition never inverts two
    // times, and two that come out equal keep the order they were scheduled in.
    for (const event of noteEnvelope(shape, duration)) {
      const at = start + event.at;
      if (event.kind === 'set') gain.setValueAtTime(event.value, at);
      else if (shape.curve === 'exponential') gain.exponentialRampToValueAtTime(event.value, at);
      else gain.linearRampToValueAtTime(event.value, at);
    }

    const stopAt = start + duration + shape.release + 0.01;
    for (const osc of this.oscillators) osc.stop(stopAt);
    if (this.onEnded && this.oscillators[0]) {
      const notify = this.onEnded;
      this.oscillators[0].onended = () => notify();
    }
    this.lfoNode?.stop(stopAt);
    this.isPlaying = true;
    return stopAt;
  }

  /**
   * The oscillators, filter settings and LFO for a note starting at
   * `scheduleTime`: everything but the envelope.
   */
  private startSources(params: VoiceParams, scheduleTime: number): void {
    const { pitch, instrument } = params;
    // Settings fixed for the whole note: an event at its start, as always, or
    // for a single-note voice that asks, the param's value.
    const fix = (param: AudioParam, value: number): void => {
      if (params.setAsValues) param.value = value;
      else param.setValueAtTime(value, scheduleTime);
    };

    // Apply pitch offset
    const adjustedPitch = applyPitchOffset(pitch, instrument.pitchOffset);
    const frequency = midiToFrequency(adjustedPitch);

    // Unison: 1 oscillator when unisonDetune === 0, 2 when > 0
    const detuneCents = (instrument.unisonDetune ?? 0) * 50;
    const oscCount = detuneCents > 0 ? 2 : 1;

    this.oscillators = Array.from({ length: oscCount }, (_, i) => {
      const osc = this.context.createOscillator();
      osc.type = instrument.waveform as OscillatorType;
      fix(osc.frequency, frequency);
      if (oscCount === 2) {
        fix(osc.detune, i === 0 ? -detuneCents / 2 : detuneCents / 2);
      }
      osc.connect(this.gainNode);
      osc.start(scheduleTime);
      return osc;
    });

    // Set filter parameters, or take the filter out of the path entirely
    this.routeFilter(instrument.filterType === 'none');
    if (!this.filterBypassed) {
      this.filterNode.type = (instrument.filterType ?? 'lowpass') as BiquadFilterType;
      fix(this.filterNode.frequency, normalizedToFilterFreq(instrument.filterCutoff));
      fix(this.filterNode.Q, normalizedToQ(instrument.filterResonance));
    }

    // LFO modulation
    const lfoDepth = instrument.lfoDepth ?? 0;
    if (lfoDepth > 0) {
      const lfoRate = normalizedToLfoRate(instrument.lfoRate ?? 0.3);
      const lfoTarget = instrument.lfoTarget ?? 'filter';

      this.lfoNode = this.context.createOscillator();
      this.lfoGainNode = this.context.createGain();

      this.lfoNode.type = 'sine';
      fix(this.lfoNode.frequency, lfoRate);

      if (lfoTarget === 'filter') {
        fix(this.lfoGainNode.gain, normalizedToLfoFilterDepth(lfoDepth));
        this.lfoNode.connect(this.lfoGainNode);
        this.lfoGainNode.connect(this.filterNode.frequency);
      } else {
        // pitch vibrato — modulate detune on all oscillators
        fix(this.lfoGainNode.gain, normalizedToLfoPitchDepth(lfoDepth));
        this.lfoNode.connect(this.lfoGainNode);
        for (const osc of this.oscillators) {
          this.lfoGainNode.connect(osc.detune);
        }
      }

      this.lfoNode.start(scheduleTime);
    }
  }

  /**
   * Put the filter in the voice's path, or take it out. Rewires only when the
   * routing actually changes, so a voice that never sees `'none'` keeps the
   * exact graph it has always had.
   */
  private routeFilter(bypass: boolean): void {
    if (bypass === this.filterBypassed) return;
    if (bypass) {
      this.gainNode.disconnect(this.filterNode);
      this.gainNode.connect(this.output);
    } else {
      this.gainNode.disconnect(this.output);
      this.gainNode.connect(this.filterNode);
    }
    this.filterBypassed = bypass;
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
    const exponential = instrument.envelopeCurve === 'exponential';
    const floor = exponential ? envelopeFloorOf(instrument) : 0;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      // Holds the envelope's own value at scheduleTime, mid-ramp included,
      // exponential or linear.
      gain.cancelAndHoldAtTime(scheduleTime);
    } else {
      // No cancelAndHoldAtTime, as in Firefox. The voice scheduled the
      // envelope, so it knows the level at scheduleTime, where gain.value
      // would be stale: noteOff runs ahead of time, and before rendering the
      // value is the param's default.
      //
      // Cancelling at scheduleTime removes any ramp still in progress there,
      // and Firefox also removes one that ended up to half a sample earlier.
      // So the envelope is always ended again at that level, with a ramp of
      // its own curve. Where the cancel removed a ramp, that traces the same
      // curve to the same point; where it removed nothing, the new ramp is
      // flat. A release before, at or after the decay's end comes out right,
      // and no comparison with the decay's end decides which.
      const scheduled = this.scheduled;
      const start = scheduled ? scheduled.start : scheduleTime;
      const held = scheduled ? envelopeLevelAt(scheduled.shape, scheduleTime - start) : 0;
      gain.cancelScheduledValues(scheduleTime);
      if (scheduled && scheduleTime > start) {
        if (scheduled.shape.curve === 'exponential') gain.exponentialRampToValueAtTime(held, scheduleTime);
        else gain.linearRampToValueAtTime(held, scheduleTime);
      } else {
        // At the note's start nothing has sounded yet
        gain.setValueAtTime(held, scheduleTime);
      }
    }

    // Release envelope: to zero, or for an exponential one, to its floor, where
    // it stays until the oscillators stop
    if (exponential) {
      gain.exponentialRampToValueAtTime(floor, scheduleTime + releaseTime);
    } else {
      gain.linearRampToValueAtTime(0, scheduleTime + releaseTime);
    }

    // Stop oscillators and LFO after release
    const oscs = [...this.oscillators];
    const releaseEnd = scheduleTime + releaseTime + 0.01;
    for (const osc of oscs) {
      osc.stop(releaseEnd);
    }
    if (this.onEnded && oscs[0]) {
      const notify = this.onEnded;
      oscs[0].onended = () => notify();
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

  /**
   * Disconnects every node of a voice whose note has ended, touching no param:
   * nothing is stopped, cancelled or rescheduled. For a voice played with
   * {@link playNote}, once its oscillators have stopped.
   */
  dispose(): void {
    for (const osc of this.oscillators) osc.disconnect();
    this.lfoNode?.disconnect();
    this.lfoGainNode?.disconnect();
    this.gainNode.disconnect();
    this.filterNode.disconnect();
    this.output.disconnect();
    this.oscillators = [];
    this.lfoNode = null;
    this.lfoGainNode = null;
    this.isPlaying = false;
  }
}

/**
 * The floor of an exponential envelope. Validation guarantees one wherever a
 * file or a cue document is loaded; a caller building params in code without
 * one gets an error naming the problem, not a silent fallback.
 */
function envelopeFloorOf(instrument: Pick<InstrumentParams, 'envelopeFloor'>): number {
  const floor = instrument.envelopeFloor;
  if (typeof floor !== 'number' || !Number.isFinite(floor) || floor <= 0 || floor >= 1) {
    throw new RangeError(
      `An exponential envelope needs envelopeFloor between 0 and 1, exclusive; got ${String(floor)}`
    );
  }
  return floor;
}

/** A note's envelope, in seconds and absolute levels, as a whole note plays it. */
export interface EnvelopeShape {
  curve: 'linear' | 'exponential';
  attack: number;
  decay: number;
  release: number;
  /** Where the attack starts and the release ends: the floor, or 0 for linear. */
  floor: number;
  peak: number;
  /** The level the decay reaches and holds until the release. */
  sustain: number;
  /** The decay ends at the release, exactly, wherever that falls after the attack. */
  decayEndsAtRelease?: boolean;
}

/** One automation event, its time in seconds from the note's start. */
export interface EnvelopeEvent {
  kind: 'set' | 'ramp';
  at: number;
  value: number;
}

/**
 * An instrument's decay in seconds, for a voice that starts a note without
 * knowing when it will be released.
 */
function fixedDecayOf(instrument: InstrumentParams | CueInstrument): number {
  if ('decayUntilRelease' in instrument && instrument.decayUntilRelease) {
    throw new RangeError(
      "A decay that lasts until the note's release needs to know when that is: play the note whole, with playNote"
    );
  }
  // Not a decay until the release, so a fixed one: every instrument has one or the other
  return normalizedToADSR(instrument.decay as number, 'decay');
}

/**
 * The envelope a voice plays for these params. `releaseAt`, seconds from the
 * note's start to its release, is null for a note started without knowing it,
 * as noteOn starts one.
 */
export function envelopeShapeOf(params: VoiceParams, releaseAt: number | null): EnvelopeShape {
  const { velocity, instrument } = params;
  const velocityScale = 1 - instrument.velocityResponse + instrument.velocityResponse * (velocity / 127);
  const peak = params.peak ?? 0.3 * velocityScale;
  const sustainLevel = instrument.sustain * peak;
  const exponential = instrument.envelopeCurve === 'exponential' && peak > 0;
  const floor = exponential ? envelopeFloorOf(instrument) : 0;
  const attack = normalizedToADSR(instrument.attack, 'attack');
  const untilRelease = 'decayUntilRelease' in instrument && instrument.decayUntilRelease === true;
  return {
    curve: exponential ? 'exponential' : 'linear',
    attack,
    // Until the release: whatever of the note is left after the attack
    decay: untilRelease && releaseAt !== null ? Math.max(0, releaseAt - attack) : fixedDecayOf(instrument),
    release: normalizedToADSR(instrument.release, 'release'),
    floor,
    peak,
    sustain: exponential ? Math.max(sustainLevel, floor) : sustainLevel,
    ...(untilRelease && { decayEndsAtRelease: true }),
  };
}

/**
 * The level of an envelope `t` seconds into a note that has not yet been
 * released, interpolated the way Web Audio interpolates its ramps.
 */
export function envelopeLevelAt(shape: EnvelopeShape, t: number): number {
  const between = (v0: number, v1: number, fraction: number) =>
    shape.curve === 'exponential' ? v0 * Math.pow(v1 / v0, fraction) : v0 + (v1 - v0) * fraction;
  if (t <= 0) return shape.floor;
  if (t < shape.attack) return between(shape.floor, shape.peak, t / shape.attack);
  const intoDecay = t - shape.attack;
  if (intoDecay < shape.decay) return between(shape.peak, shape.sustain, intoDecay / shape.decay);
  return shape.sustain;
}

/**
 * Every automation event of a whole note released `releaseAt` seconds after
 * its start, in order. Nothing in it is ever cancelled.
 *
 * Which branch applies depends on where the release falls: in the attack, in
 * the decay, or after it, where the sustain level holds. The choice is made
 * on times within the note, which are the same for every press, never on
 * timestamps, whose rounding depends on how long the page has been open. And
 * each pair of branches meets at its boundary: a release exactly at the
 * decay's end ramps to the sustain level whichever branch takes it, so no
 * comparison of two nearly equal times changes what is heard.
 */
export function noteEnvelope(shape: EnvelopeShape, releaseAt: number): EnvelopeEvent[] {
  // A decay until the release ends there exactly, not at attack + decay, which
  // can round to a sample either side of it
  const decayEnd = shape.decayEndsAtRelease ? releaseAt : shape.attack + shape.decay;
  const events: EnvelopeEvent[] = [{ kind: 'set', at: 0, value: shape.floor }];
  if (releaseAt < shape.attack) {
    // Released during the attack: the attack ends there, at the level it reached
    events.push({ kind: 'ramp', at: releaseAt, value: envelopeLevelAt(shape, releaseAt) });
  } else if (releaseAt < decayEnd) {
    // During the decay: the decay ends where the release begins
    events.push({ kind: 'ramp', at: shape.attack, value: shape.peak });
    events.push({ kind: 'ramp', at: releaseAt, value: envelopeLevelAt(shape, releaseAt) });
  } else {
    // After it: the sustain level holds until the release, which this anchors
    events.push({ kind: 'ramp', at: shape.attack, value: shape.peak });
    events.push({ kind: 'ramp', at: decayEnd, value: shape.sustain });
    events.push({ kind: 'set', at: releaseAt, value: shape.sustain });
  }
  events.push({ kind: 'ramp', at: releaseAt + shape.release, value: shape.floor });
  return events;
}

