import type { SoundscapeState, Track, Note, InstrumentParams, MixerState, TrackMixerState } from '../types';
import { defaultTrackMixerState } from '../types';
import { beatsToSeconds, normalizedToADSR } from '../utils/time';
import { VoiceSynthesizer } from './VoiceSynthesizer';
import type { VoiceParams } from './VoiceSynthesizer';
import { EffectsChain, asksForNoEffect } from './EffectsChain';
import type { EffectsParams } from './EffectsChain';
import { getPresetById } from '../presets';
import { CueDocumentError } from '../cues/types';
import type { CueDocument, CueInstrument } from '../cues/types';
import { validateCueDocument } from '../cues/validate';

const LOOKAHEAD_MS = 100;
const SCHEDULE_INTERVAL_MS = 25;
const MAX_VOICES_PER_TRACK = 8;

// AudioWorklet processor code, loaded as an inline blob to avoid bundler/path issues.
// process() is called every 128 samples on the audio rendering thread, which is
// never throttled by browsers — even in background tabs. Ticks are posted every
// 8th block (~1024 samples ≈ 23 ms at 44.1 kHz): comfortably inside the 100 ms
// scheduling lookahead without flooding the main thread with messages.
const SCHEDULER_WORKLET_CODE = `
class SchedulerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._blocks = 0;
  }
  process() {
    if (++this._blocks >= 8) {
      this._blocks = 0;
      this.port.postMessage({ type: 'tick' });
    }
    return true;
  }
}
registerProcessor('soundscape-scheduler', SchedulerProcessor);
`;

interface ScheduledNote {
  note: Note;
  trackId: string;
  /** Next loop iteration whose note-on has not been scheduled yet. */
  nextStartIteration: number;
  /** Iterations whose note-on is scheduled but whose note-off is still pending. */
  startedIterations: number[];
}

/**
 * activeVoices key: a note can be sounding in two loop iterations at once
 * (its tail crossing the boundary while the next iteration starts), so voices
 * are keyed per (note, iteration) rather than per note.
 */
function voiceKey(noteId: string, iteration: number): string {
  return `${noteId}|${iteration}`;
}

/** A loaded cue instrument's effects, and how many of its voices still sound. */
interface CueChain {
  /** Null for an instrument that asks for no effect: its voices play straight into the cue output. */
  effectsChain: EffectsChain | null;
  voices: number;
  /** True once a newer document replaced this one's instruments. */
  retired: boolean;
}

/** A cue instrument's effect settings, in the form EffectsChain takes. */
function cueEffects(instrument: CueInstrument): EffectsParams {
  return {
    delayTime: instrument.delayTime,
    delayFeedback: instrument.delayFeedback,
    delayMix: instrument.delayMix,
    distortion: instrument.distortion,
    reverbMix: instrument.reverbMix,
  };
}

interface TrackChannel {
  gainNode: GainNode;
  effectsChain: EffectsChain;
  voices: VoiceSynthesizer[];
  activeVoices: Map<string, VoiceSynthesizer>; // noteId -> voice
  lastEffects: EffectsParams | null; // last-applied values, for change detection
}

/**
 * Core audio playback engine built on the Web Audio API.
 *
 * `AudioEngine` manages the full lifecycle of audio playback: scheduling notes
 * ahead of time, applying per-track effects chains, handling the mixer, and
 * maintaining a looping transport.
 *
 * ### Typical usage
 * ```ts
 * const engine = new AudioEngine();
 * await engine.initialize();
 *
 * engine.updateState(myState);  // sync with your app state
 * engine.onBeatUpdate((beat) => setPlayhead(beat));
 * engine.play();
 * ```
 *
 * @remarks
 * Must be constructed and used in a browser environment with Web Audio API support.
 * Call {@link initialize} once before any playback methods — this creates the
 * `AudioContext` which requires a user gesture on most browsers.
 */
/** Options for {@link AudioEngine}. All are optional. */
export interface AudioEngineOptions {
  /**
   * A context to play into instead of the `AudioContext` the engine would
   * create. Pass an `OfflineAudioContext` to render offline, or a context your
   * application already owns to share it. The engine never closes a context it
   * was given; the caller owns it.
   */
  context?: BaseAudioContext;
}

/** An OfflineAudioContext starts when it is rendered, and has no close(). */
function isOffline(context: BaseAudioContext): boolean {
  return 'startRendering' in context;
}

export class AudioEngine {
  private context: BaseAudioContext | null = null;
  private readonly givenContext: BaseAudioContext | null;
  private masterGain: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private trackChannels: Map<string, TrackChannel> = new Map();

  private isPlaying = false;
  private startTime = 0; // AudioContext time when playback started
  private startBeat = 0; // Beat position when playback started
  private currentBeat = 0;
  private tempo = 120;
  private loopEnabled = true;
  private loopLengthBeats = 16;

  private scheduledNotes: ScheduledNote[] = [];
  // AudioWorklet-based scheduler (preferred — audio-thread timing, never throttled)
  private schedulerNode: AudioWorkletNode | null = null;
  private _workletAvailable = false;
  // setInterval fallback for environments without AudioWorklet support
  private scheduleIntervalId: ReturnType<typeof setInterval> | null = null;

  // Multi-subscriber beat update listeners. onBeatUpdate() returns an unsubscribe fn.
  private beatUpdateListeners = new Set<(beat: number) => void>();

  private currentState: SoundscapeState | null = null;

  // Cues: created by the first loadCues, so an engine that never loads cues
  // keeps exactly the graph it always had.
  private cueBus: GainNode | null = null;
  private cueVolume = 1;
  private cuesMuted = false;
  private cueDocument: CueDocument | null = null;
  private cueChains: Map<string, CueChain> = new Map();

  // Held interactive voices for live MIDI input, keyed by pitch.
  // Independent of the transport: playback stop leaves them sounding.
  private midiVoices: Map<
    number,
    { voice: VoiceSynthesizer; tempGain: GainNode; params: InstrumentParams }
  > = new Map();

  /**
   * @param options - Optional. `context` plays into a context you supply; with
   *   no options, {@link initialize} creates an `AudioContext`, exactly as it
   *   always has.
   */
  constructor(options: AudioEngineOptions = {}) {
    this.givenContext = options.context ?? null;
  }

  /**
   * Creates the underlying `AudioContext` and master gain node, and registers
   * the AudioWorklet scheduler processor.
   *
   * Must be called once before any other playback method. Safe to call multiple
   * times — subsequent calls are no-ops if already initialized.
   *
   * @remarks
   * Browsers require a user gesture (click, keydown, etc.) before an
   * `AudioContext` can produce sound. Call this inside an event handler.
   */
  async initialize(): Promise<void> {
    if (this.context) return;

    this.context = this.givenContext ?? new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.8;

    // Master compressor: transparent limiter that prevents clipping on loud patches.
    // Fixed mastering settings: gentle threshold, high ratio, fast attack, medium release.
    this.compressorNode = this.context.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-24, this.context.currentTime);
    this.compressorNode.knee.setValueAtTime(30, this.context.currentTime);
    this.compressorNode.ratio.setValueAtTime(12, this.context.currentTime);
    this.compressorNode.attack.setValueAtTime(0.003, this.context.currentTime);
    this.compressorNode.release.setValueAtTime(0.25, this.context.currentTime);

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.compressorNode);
    this.compressorNode.connect(this.analyserNode);
    this.analyserNode.connect(this.context.destination);

    // Register AudioWorklet scheduler. Falls back to setInterval if unavailable
    // (non-secure context, very old browser, or Jest test environment).
    try {
      const blob = new Blob([SCHEDULER_WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await this.context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this._workletAvailable = true;
    } catch {
      this._workletAvailable = false;
    }
  }

  /**
   * Resumes a suspended `AudioContext`.
   *
   * Browsers automatically suspend the context when the page loses focus.
   * Call this on the next user interaction to restore audio output.
   */
  async resume(): Promise<void> {
    const context = this.context;
    // An offline context runs when it is rendered, and rejects a resume before.
    if (context && context.state === 'suspended' && !isOffline(context)) {
      await (context as AudioContext).resume();
    }
  }

  private ensureContext(): BaseAudioContext {
    if (!this.context) {
      throw new Error('AudioEngine not initialized');
    }
    return this.context;
  }

  private ensureMasterGain(): GainNode {
    if (!this.masterGain) {
      throw new Error('AudioEngine not initialized');
    }
    return this.masterGain;
  }

  /**
   * Synchronizes the engine with the latest {@link SoundscapeState}.
   *
   * Call this whenever your application state changes — the engine diffs
   * the new state against the previous one and only updates what changed:
   * - Creates or destroys track channels as tracks are added/removed.
   * - Updates effects parameters from preset + per-track overrides.
   * - If currently playing, live-syncs the scheduled note queue so changes
   *   are reflected in the next scheduling window (~100 ms lookahead).
   *
   * @param state - The full current project state.
   */
  updateState(state: SoundscapeState): void {
    this.currentState = state;
    this.tempo = state.metadata.tempo;
    this.loopLengthBeats = state.metadata.lengthBeats;

    // Ensure track channels exist
    for (const track of state.tracks) {
      this.ensureTrackChannel(track, state);
    }

    // Remove channels for deleted tracks
    const trackIds = new Set(state.tracks.map((t) => t.id));
    for (const [id, channel] of this.trackChannels) {
      if (!trackIds.has(id)) {
        this.removeTrackChannel(id, channel);
      }
    }

    // Update mixer
    this.updateMixer(state.mixer);

    // Sync scheduled notes with current state during playback
    if (this.isPlaying) {
      this.syncScheduledNotes(state);
    }
  }

  private syncScheduledNotes(state: SoundscapeState): void {
    // Index existing scheduled notes by noteId for fast lookup
    const existingByNoteId = new Map<string, ScheduledNote>();
    for (const sn of this.scheduledNotes) {
      existingByNoteId.set(sn.note.id, sn);
    }

    // Build set of all current note IDs
    const currentNoteIds = new Set<string>();
    const newScheduledNotes: ScheduledNote[] = [];

    for (const track of state.tracks) {
      for (const note of track.notes) {
        currentNoteIds.add(note.id);
        const existing = existingByNoteId.get(note.id);
        if (existing) {
          // Keep existing scheduling state
          newScheduledNotes.push({ ...existing, trackId: track.id, note });
        } else {
          // New note — starts unscheduled; scheduleNotes fast-forwards
          // nextStartIteration past iterations that already elapsed
          newScheduledNotes.push({
            note,
            trackId: track.id,
            nextStartIteration: 0,
            startedIterations: [],
          });
        }
      }
    }

    // Stop voices for removed notes, in every iteration they are sounding
    for (const sn of this.scheduledNotes) {
      if (!currentNoteIds.has(sn.note.id)) {
        const channel = this.trackChannels.get(sn.trackId);
        if (channel) {
          for (const iteration of sn.startedIterations) {
            const key = voiceKey(sn.note.id, iteration);
            const voice = channel.activeVoices.get(key);
            if (voice) {
              voice.stop();
              channel.activeVoices.delete(key);
            }
          }
        }
      }
    }

    this.scheduledNotes = newScheduledNotes;
  }

  private ensureTrackChannel(track: Track, state: SoundscapeState): TrackChannel {
    const context = this.ensureContext();
    const masterGain = this.ensureMasterGain();

    let channel = this.trackChannels.get(track.id);

    if (!channel) {
      // Create new channel
      const gainNode = context.createGain();
      const effectsChain = new EffectsChain(context);

      effectsChain.getOutput().connect(gainNode);
      gainNode.connect(masterGain);

      channel = {
        gainNode,
        effectsChain,
        voices: [],
        activeVoices: new Map(),
        lastEffects: null,
      };

      // Create voice pool
      for (let i = 0; i < MAX_VOICES_PER_TRACK; i++) {
        channel.voices.push(new VoiceSynthesizer(context, effectsChain.getInput()));
      }

      this.trackChannels.set(track.id, channel);
    }

    // Update effects based on preset + overrides. Compare by value against
    // the last-applied set — updateState runs on every app dispatch, and
    // re-applying identical params would rebuild curves and touch AudioParams
    // for no reason. (Value comparison, not reference: callers are allowed to
    // pass freshly-built state objects.)
    const preset = getPresetById(state.presets, track.presetId);
    if (preset) {
      const params = { ...preset.params, ...track.paramOverrides };
      const effects: EffectsParams = {
        delayTime: params.delayTime,
        delayFeedback: params.delayFeedback,
        delayMix: params.delayMix,
        distortion: params.distortion,
        reverbMix: params.reverbMix ?? 0,
      };
      const last = channel.lastEffects;
      const unchanged =
        last !== null &&
        last.delayTime === effects.delayTime &&
        last.delayFeedback === effects.delayFeedback &&
        last.delayMix === effects.delayMix &&
        last.distortion === effects.distortion &&
        last.reverbMix === effects.reverbMix;
      if (!unchanged) {
        channel.effectsChain.setParams(effects);
        channel.lastEffects = effects;
      }
    }

    return channel;
  }

  private removeTrackChannel(id: string, channel: TrackChannel): void {
    // Stop all voices
    for (const voice of channel.voices) {
      voice.disconnect();
    }
    channel.effectsChain.disconnect();
    channel.gainNode.disconnect();
    this.trackChannels.delete(id);
  }

  /**
   * Applies mixer state (volume, mute, solo) to all track channels immediately.
   *
   * This is called automatically by {@link updateState}, but you can call it
   * directly for low-latency mixer updates without a full state sync.
   *
   * @param mixer - The mixer state to apply.
   */
  updateMixer(mixer: MixerState): void {
    const masterGain = this.masterGain;
    if (!masterGain) return;

    const context = this.ensureContext();
    masterGain.gain.setValueAtTime(mixer.masterVolume, context.currentTime);

    // Check for solo tracks
    const hasSolo = Object.values(mixer.tracks).some((t) => t.solo);

    for (const [trackId, channel] of this.trackChannels) {
      const trackMixer: TrackMixerState = mixer.tracks[trackId] ?? defaultTrackMixerState;

      let volume = trackMixer.volume;
      if (trackMixer.mute || (hasSolo && !trackMixer.solo)) {
        volume = 0;
      }

      channel.gainNode.gain.setValueAtTime(volume, context.currentTime);
    }
  }

  /**
   * Starts playback from the given beat position.
   *
   * Notes are scheduled ~100 ms ahead of the audio clock. When an
   * `AudioWorklet` scheduler is available, ticks arrive every ~23 ms
   * (1024 samples) on the audio thread — immune to background-tab throttling.
   * Falls back to a 25 ms `setInterval` if `AudioWorklet` is unavailable.
   *
   * Call {@link updateState} before `play()` to ensure the engine has the
   * latest tracks and notes.
   *
   * @param startBeat - Beat position to begin playback from. Defaults to `0`.
   */
  play(startBeat: number = 0): void {
    if (this.isPlaying || !this.currentState) return;

    const context = this.ensureContext();
    this.isPlaying = true;
    this.startBeat = startBeat;
    this.currentBeat = startBeat;
    this.startTime = context.currentTime;

    // Prepare scheduled notes
    this.scheduledNotes = [];
    for (const track of this.currentState.tracks) {
      for (const note of track.notes) {
        this.scheduledNotes.push({
          note,
          trackId: track.id,
          nextStartIteration: 0,
          startedIterations: [],
        });
      }
    }

    // Start scheduling loop — prefer AudioWorklet for audio-thread accuracy
    if (this._workletAvailable) {
      this.schedulerNode = new AudioWorkletNode(context, 'soundscape-scheduler');
      this.schedulerNode.port.onmessage = () => {
        this.scheduleNotes();
        this.updateCurrentBeat();
      };
      // Must be connected into the graph for process() to be called
      this.schedulerNode.connect(context.destination);
    } else {
      this.scheduleIntervalId = setInterval(() => {
        this.scheduleNotes();
        this.updateCurrentBeat();
      }, SCHEDULE_INTERVAL_MS);
    }

    // Initial schedule
    this.scheduleNotes();
  }

  /**
   * Stops playback and silences all active voices immediately.
   *
   * Resets the playhead to beat 0 and notifies all beat update subscribers
   * with `0`. The engine remains initialized and ready to {@link play} again.
   */
  stop(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;

    if (this.schedulerNode) {
      this.schedulerNode.port.onmessage = null;
      this.schedulerNode.disconnect();
      this.schedulerNode = null;
    }
    if (this.scheduleIntervalId !== null) {
      clearInterval(this.scheduleIntervalId);
      this.scheduleIntervalId = null;
    }

    // Stop all active voices
    for (const channel of this.trackChannels.values()) {
      for (const voice of channel.voices) {
        voice.stop();
      }
      channel.activeVoices.clear();
    }

    this.scheduledNotes = [];
    this.currentBeat = 0;
    this.emitBeatUpdate(0);
  }

  private updateCurrentBeat(): void {
    if (!this.isPlaying) return;

    // The transport anchor (startTime/startBeat) is never rebased at the loop
    // boundary — scheduling works in absolute time across iterations, and the
    // wrap only affects the reported beat position.
    const context = this.ensureContext();
    const elapsedTime = context.currentTime - this.startTime;
    const elapsedBeats = (elapsedTime * this.tempo) / 60;
    const absoluteBeat = this.startBeat + elapsedBeats;
    const beat = this.loopEnabled ? absoluteBeat % this.loopLengthBeats : absoluteBeat;

    this.currentBeat = beat;
    this.emitBeatUpdate(beat);
  }

  private emitBeatUpdate(beat: number): void {
    for (const listener of this.beatUpdateListeners) {
      listener(beat);
    }
  }

  private scheduleNotes(): void {
    if (!this.isPlaying || !this.currentState) return;

    const context = this.ensureContext();
    const lookaheadSec = LOOKAHEAD_MS / 1000;
    const currentTime = context.currentTime;
    const lookaheadTime = currentTime + lookaheadSec;
    const loopBeats = this.loopLengthBeats;

    for (const scheduled of this.scheduledNotes) {
      const { note, trackId } = scheduled;
      const track = this.currentState.tracks.find((t) => t.id === trackId);
      if (!track) continue;

      const channel = this.trackChannels.get(trackId);
      if (!channel) continue;

      const preset = getPresetById(this.currentState.presets, track.presetId);
      if (!preset) continue;

      const params = { ...preset.params, ...track.paramOverrides };

      // Schedule note starts iteration by iteration. Because times are
      // absolute (transport anchor is never rebased), the lookahead can cross
      // the loop boundary and the next iteration's downbeat is scheduled
      // sample-accurately before the wrap. Iterations that already elapsed
      // (e.g. a note added mid-playback) are skipped without scheduling.
      for (;;) {
        const iteration = scheduled.nextStartIteration;
        if (iteration > 0 && !this.loopEnabled) break;
        const startBeats = note.startTime - this.startBeat + iteration * loopBeats;
        const noteStartTime = this.startTime + beatsToSeconds(startBeats, this.tempo);
        if (noteStartTime >= lookaheadTime) break;
        if (noteStartTime >= currentTime - 0.1) {
          const voice = this.getAvailableVoice(channel);
          if (voice) {
            const voiceParams: VoiceParams = {
              pitch: note.pitch,
              velocity: note.velocity,
              instrument: params,
            };
            voice.noteOn(voiceParams, noteStartTime);
            channel.activeVoices.set(voiceKey(note.id, iteration), voice);
            scheduled.startedIterations.push(iteration);
          }
        }
        scheduled.nextStartIteration = iteration + 1;
      }

      // Schedule note ends for started iterations. Duration is read fresh so
      // live edits to a sounding note still take effect.
      if (scheduled.startedIterations.length > 0) {
        const stillPending: number[] = [];
        for (const iteration of scheduled.startedIterations) {
          const endBeats = note.startTime + note.duration - this.startBeat + iteration * loopBeats;
          const noteEndTime = this.startTime + beatsToSeconds(endBeats, this.tempo);
          if (noteEndTime < lookaheadTime) {
            const key = voiceKey(note.id, iteration);
            const voice = channel.activeVoices.get(key);
            if (voice) {
              voice.noteOff(params, noteEndTime);
              channel.activeVoices.delete(key);
            }
          } else {
            stillPending.push(iteration);
          }
        }
        scheduled.startedIterations = stillPending;
      }
    }
  }

  private getAvailableVoice(channel: TrackChannel): VoiceSynthesizer | null {
    // First, try to find a non-playing voice
    for (const voice of channel.voices) {
      if (!voice.getIsPlaying()) {
        return voice;
      }
    }

    // Voice stealing: reuse the first pool slot.
    // channel.voices always has MAX_VOICES_PER_TRACK entries — index 0 is safe
    const voice = channel.voices[0] ?? null;
    if (voice) {
      voice.stop();
      // Remove the stolen note's mapping and drop its pending end, so its
      // noteOff cannot release the note that reuses this voice.
      for (const [key, activeVoice] of channel.activeVoices) {
        if (activeVoice === voice) {
          channel.activeVoices.delete(key);
          const sep = key.lastIndexOf('|');
          const noteId = key.slice(0, sep);
          const iteration = Number(key.slice(sep + 1));
          const scheduled = this.scheduledNotes.find((sn) => sn.note.id === noteId);
          if (scheduled) {
            scheduled.startedIterations = scheduled.startedIterations.filter((i) => i !== iteration);
          }
        }
      }
    }
    return voice;
  }

  /**
   * Changes the playback tempo without interrupting playback.
   *
   * If currently playing, the transport start time is recalculated so the
   * playhead position stays consistent at the new BPM.
   *
   * @param bpm - New tempo in beats per minute.
   */
  setTempo(bpm: number): void {
    if (this.isPlaying) {
      // Adjust start time to maintain position
      const context = this.ensureContext();
      const currentTimeInOldTempo = context.currentTime - this.startTime;
      const currentBeats = (currentTimeInOldTempo * this.tempo) / 60;
      this.startTime = context.currentTime - (currentBeats * 60) / bpm;
    }
    this.tempo = bpm;
  }

  /**
   * Enables or disables loop mode.
   *
   * When enabled, playback wraps back to beat 0 when it reaches `lengthBeats`.
   *
   * @param enabled - `true` to loop, `false` to stop at the end.
   */
  setLoop(enabled: boolean): void {
    this.loopEnabled = enabled;
  }

  /**
   * Sets the loop length in beats.
   *
   * This should match `SoundscapeState.metadata.lengthBeats` in most cases.
   * Updated automatically when you call {@link updateState}.
   *
   * @param beats - Total number of beats before the loop wraps.
   */
  setLoopLength(beats: number): void {
    this.loopLengthBeats = beats;
  }

  /**
   * Returns the current playhead position in beats.
   *
   * Updated approximately every ~23 ms (AudioWorklet) or every 25 ms (fallback)
   * during playback. Subscribe to continuous updates via {@link onBeatUpdate}
   * instead of polling.
   *
   * @returns Current beat position (0-based), or `0` if stopped.
   */
  getCurrentBeat(): number {
    return this.currentBeat;
  }

  /**
   * Returns whether the engine is currently playing.
   *
   * @returns `true` if {@link play} has been called and {@link stop} has not.
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Returns the `AnalyserNode` tapped off the master output, or `null` before
   * {@link initialize} has been called. Use this to drive real-time visualisers.
   *
   * @example
   * const analyser = engine.getAnalyserNode();
   * if (analyser) {
   *   const data = new Uint8Array(analyser.frequencyBinCount);
   *   analyser.getByteTimeDomainData(data); // oscilloscope
   * }
   */
  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  /**
   * Subscribes to beat position updates during playback.
   *
   * The callback fires on every scheduler tick (~23 ms with AudioWorklet,
   * ~25 ms fallback) with the current beat position, and is called with `0`
   * when {@link stop} is invoked. Multiple subscribers are supported.
   *
   * @param callback - Receives the current beat position (0-based) on each tick.
   * @returns An unsubscribe function — call it to remove this listener.
   *
   * @example
   * const unsub = engine.onBeatUpdate((beat) => {
   *   setPlayheadPosition(beat);
   * });
   * // Later:
   * unsub();
   */
  onBeatUpdate(callback: (beat: number) => void): () => void {
    this.beatUpdateListeners.add(callback);
    return () => {
      this.beatUpdateListeners.delete(callback);
    };
  }

  /**
   * Plays a single note immediately for preview purposes (e.g., when the user
   * clicks a key in a piano roll or selects a preset).
   *
   * The note is automatically released after 500 ms and cleaned up after the
   * release tail completes (~1 s total). No interaction with the transport
   * or scheduled notes queue.
   *
   * @param pitch - MIDI pitch to preview (0–127).
   * @param velocity - Note velocity (0–127).
   * @param presetId - ID of the preset to use for the preview sound.
   * @param paramOverrides - Optional per-parameter overrides applied on top of
   *   the preset's default values. Useful for previewing knob changes in real time.
   *
   * @example
   * // Preview middle C using the current preset with a brighter filter
   * engine.previewNote(60, 100, 'preset-lead', { filterCutoff: 0.9 });
   */
  previewNote(pitch: number, velocity: number, presetId: string, paramOverrides?: Partial<InstrumentParams>): void {
    if (!this.currentState) return;

    const context = this.ensureContext();
    const masterGain = this.ensureMasterGain();

    const preset = getPresetById(this.currentState.presets, presetId);
    if (!preset) return;

    const params = { ...preset.params, ...paramOverrides };

    // Create a temporary voice
    const tempGain = context.createGain();
    tempGain.connect(masterGain);
    tempGain.gain.value = 0.8;

    const voice = new VoiceSynthesizer(context, tempGain);

    voice.noteOn({ pitch, velocity, instrument: params }, context.currentTime);

    // Auto release after 0.5 seconds, then clean up once the instrument's
    // actual release tail (up to ~5 s) has finished — a fixed delay would
    // audibly truncate long releases.
    const releaseMs = normalizedToADSR(params.release, 'release') * 1000;
    setTimeout(() => {
      voice.noteOff(params, context.currentTime);
      setTimeout(() => {
        voice.disconnect();
        tempGain.disconnect();
      }, releaseMs + 100);
    }, 500);
  }

  /**
   * Starts a sustained interactive note for live MIDI input.
   *
   * Unlike {@link previewNote}, the note holds until {@link stopMIDINote} is
   * called for the same pitch. Held notes are independent of the transport —
   * {@link stop} leaves them sounding; {@link destroy} force-stops them.
   * Re-striking a pitch that is already held replaces the previous voice.
   *
   * @param pitch - MIDI pitch to play (0–127).
   * @param velocity - Note velocity (0–127).
   * @param presetId - ID of the preset that defines the sound.
   * @param paramOverrides - Optional per-parameter overrides on top of the preset.
   */
  startMIDINote(
    pitch: number,
    velocity: number,
    presetId: string,
    paramOverrides?: Partial<InstrumentParams>
  ): void {
    if (!this.currentState) return;

    const context = this.ensureContext();
    const masterGain = this.ensureMasterGain();

    const preset = getPresetById(this.currentState.presets, presetId);
    if (!preset) return;

    // Replace an existing voice on this pitch (keyboard re-strike)
    const existing = this.midiVoices.get(pitch);
    if (existing) {
      existing.voice.stop();
      existing.voice.disconnect();
      existing.tempGain.disconnect();
      this.midiVoices.delete(pitch);
    }

    const params = { ...preset.params, ...paramOverrides };
    const tempGain = context.createGain();
    tempGain.connect(masterGain);
    tempGain.gain.value = 0.8;

    const voice = new VoiceSynthesizer(context, tempGain);
    voice.noteOn({ pitch, velocity, instrument: params }, context.currentTime);
    this.midiVoices.set(pitch, { voice, tempGain, params });
  }

  /**
   * Releases a note held via {@link startMIDINote}.
   *
   * Triggers the instrument's release envelope and cleans up the voice after
   * the tail completes. Releasing a pitch that is not held is a no-op.
   *
   * @param pitch - MIDI pitch to release (0–127).
   */
  stopMIDINote(pitch: number): void {
    const held = this.midiVoices.get(pitch);
    if (!held) return;
    this.midiVoices.delete(pitch);

    const context = this.ensureContext();
    held.voice.noteOff(held.params, context.currentTime);

    const releaseMs = normalizedToADSR(held.params.release, 'release') * 1000;
    setTimeout(() => {
      held.voice.disconnect();
      held.tempGain.disconnect();
    }, releaseMs + 100);
  }

  /**
   * Loads a cue document, replacing any loaded before. Cues already ringing
   * from the previous document play out on their own instruments.
   *
   * The first call creates the cues' own output: a gain with its own volume and
   * mute, feeding the analyser directly, so cues bypass the master gain and the
   * master compressor. (The compressor raises a lone cue by 4 to 5 dB.)
   *
   * The engine keeps its own copy of the document. Changing the one passed in
   * afterwards, as an editor will, changes nothing that plays until it is
   * loaded again.
   *
   * @param document - A cue document, already parsed. Validated here; see
   *   {@link parseCueDocument} for JSON text, which also catches duplicate keys.
   * @throws {@link CueDocumentError} listing every problem, with its path.
   */
  loadCues(document: unknown): void {
    const context = this.ensureContext();
    const result = validateCueDocument(document);
    if (!result.ok) throw new CueDocumentError(result.problems);
    const own = structuredClone(result.document);

    if (!this.cueBus) {
      this.cueBus = context.createGain();
      this.applyCueGain();
      // Feed the analyser, which passes its input through unchanged, so cues
      // still show on a visualizer without touching the music's path.
      this.cueBus.connect(this.analyserNode ?? context.destination);
    }

    for (const chain of this.cueChains.values()) this.retireCueChain(chain);
    this.cueChains = new Map();
    for (const [name, instrument] of Object.entries(own.instruments)) {
      // A chain with no effect to make sounds the same as none, but its delay
      // and waveshaper would run for as long as the context does. A cue
      // instrument's effects are fixed once loaded, so this holds.
      const effects = cueEffects(instrument);
      if (asksForNoEffect(effects)) {
        this.cueChains.set(name, { effectsChain: null, voices: 0, retired: false });
        continue;
      }
      // A cue with no distortion must not be oversampled: WebKit delays it 6
      // samples. And no cue can ask for reverb, so it gets no convolver.
      const effectsChain = new EffectsChain(context, { oversampleOnlyWhenDistorting: true, reverb: false });
      effectsChain.setParams(effects);
      effectsChain.getOutput().connect(this.cueBus);
      this.cueChains.set(name, { effectsChain, voices: 0, retired: false });
    }
    this.cueDocument = own;
  }

  /** Names of the cues in the loaded document, in the order the document has them. */
  getCueNames(): string[] {
    return this.cueDocument ? Object.keys(this.cueDocument.cues) : [];
  }

  /**
   * Plays a cue from the loaded document.
   *
   * Every note's start, envelope and stop is scheduled on the audio clock here,
   * at once, and nothing scheduled is ever cancelled: no timer decides when
   * anything sounds, and no release depends on `cancelAndHoldAtTime` or on how
   * a browser cancels a ramp. Each note gets a voice of
   * its own, so notes and cues overlap freely: a second cue fired while the
   * first rings does not cut it off. Voices are disconnected when their
   * oscillators end.
   *
   * @param name - The cue's name in the loaded document.
   * @param when - Audio-clock time to start at, in seconds. Defaults to now;
   *   a time already past starts now, keeping the cue's own timing.
   */
  playCue(name: string, when?: number): void {
    const context = this.ensureContext();
    const document = this.cueDocument;
    if (!document) throw new Error('No cue document is loaded. Call loadCues first.');
    if (!Object.prototype.hasOwnProperty.call(document.cues, name)) {
      throw new Error(`No cue named "${name}" in the loaded cue document.`);
    }
    const base = Math.max(when ?? context.currentTime, context.currentTime);

    for (const note of document.cues[name]!.notes) {
      const chain = this.cueChains.get(note.instrument)!;
      const instrument = document.instruments[note.instrument]!;
      const voice = new VoiceSynthesizer(context, chain.effectsChain?.getInput() ?? this.cueBus!);
      chain.voices++;
      voice.onEnded = () => {
        // Releases the nodes without touching a param: a cue never cancels
        voice.dispose();
        chain.voices--;
        if (chain.retired && chain.voices === 0) chain.effectsChain?.disconnect();
      };
      // The whole note at once, so no release depends on how a browser cancels
      voice.playNote(
        { pitch: note.pitch, velocity: 127, instrument, peak: note.level, setAsValues: true },
        base + note.start,
        note.duration
      );
    }
  }

  /** Volume of every cue, as a linear gain. 1, the default, leaves each note at its level. */
  setCueVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0) {
      throw new RangeError(`Cue volume must be a finite number, 0 or more; got ${volume}`);
    }
    this.cueVolume = volume;
    this.applyCueGain();
  }

  /** Mutes or unmutes every cue, including any ringing now. */
  setCuesMuted(muted: boolean): void {
    this.cuesMuted = muted;
    this.applyCueGain();
  }

  private applyCueGain(): void {
    if (!this.cueBus || !this.context) return;
    this.cueBus.gain.setValueAtTime(this.cuesMuted ? 0 : this.cueVolume, this.context.currentTime);
  }

  /** Disconnect a replaced document's chain now, or once its last voice ends. */
  private retireCueChain(chain: CueChain): void {
    chain.retired = true;
    if (chain.voices === 0) chain.effectsChain?.disconnect();
  }

  private stopAllMIDINotes(): void {
    for (const held of this.midiVoices.values()) {
      held.voice.stop();
      held.voice.disconnect();
      held.tempGain.disconnect();
    }
    this.midiVoices.clear();
  }

  /**
   * Stops playback, disconnects all audio nodes, and closes the `AudioContext`.
   *
   * After calling `destroy()`, the engine instance should not be reused.
   * Create a new `AudioEngine` if you need to restart.
   */
  destroy(): void {
    this.stop();
    this.stopAllMIDINotes();

    // Clear all beat update subscribers
    this.beatUpdateListeners.clear();

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.schedulerNode) {
      this.schedulerNode.disconnect();
      this.schedulerNode = null;
    }

    for (const [id, channel] of this.trackChannels) {
      this.removeTrackChannel(id, channel);
    }

    for (const chain of this.cueChains.values()) chain.effectsChain?.disconnect();
    this.cueChains.clear();
    this.cueDocument = null;
    if (this.cueBus) {
      this.cueBus.disconnect();
      this.cueBus = null;
    }

    if (this.context) {
      // Close only a context this engine created. A given one belongs to the
      // caller, and an offline one has no close().
      if (!this.givenContext && !isOffline(this.context)) {
        void (this.context as AudioContext).close();
      }
      this.context = null;
    }

    this.masterGain = null;
    this.compressorNode = null;
  }
}
