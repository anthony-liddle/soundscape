import type { SoundscapeState, Track, Note, InstrumentParams, MixerState, TrackMixerState } from '../types';
import { defaultTrackMixerState } from '../types';
import { beatsToSeconds } from '../utils/time';
import { VoiceSynthesizer } from './VoiceSynthesizer';
import type { VoiceParams } from './VoiceSynthesizer';
import { EffectsChain } from './EffectsChain';
import { getPresetById } from '../presets';

const LOOKAHEAD_MS = 100;
const SCHEDULE_INTERVAL_MS = 25;
const MAX_VOICES_PER_TRACK = 8;

interface ScheduledNote {
  note: Note;
  trackId: string;
  startScheduled: boolean;
  endScheduled: boolean;
}

interface TrackChannel {
  gainNode: GainNode;
  effectsChain: EffectsChain;
  voices: VoiceSynthesizer[];
  activeVoices: Map<string, VoiceSynthesizer>; // noteId -> voice
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
export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackChannels: Map<string, TrackChannel> = new Map();

  private isPlaying = false;
  private startTime = 0; // AudioContext time when playback started
  private startBeat = 0; // Beat position when playback started
  private currentBeat = 0;
  private tempo = 120;
  private loopEnabled = true;
  private loopLengthBeats = 16;

  private scheduledNotes: ScheduledNote[] = [];
  private scheduleIntervalId: ReturnType<typeof setInterval> | null = null;
  private beatUpdateCallback: ((beat: number) => void) | null = null;

  private currentState: SoundscapeState | null = null;

  /**
   * Creates the underlying `AudioContext` and master gain node.
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

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.masterGain.gain.value = 0.8;
  }

  /**
   * Resumes a suspended `AudioContext`.
   *
   * Browsers automatically suspend the context when the page loses focus.
   * Call this on the next user interaction to restore audio output.
   */
  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  private ensureContext(): AudioContext {
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
          // New note — add as unscheduled
          newScheduledNotes.push({
            note,
            trackId: track.id,
            startScheduled: false,
            endScheduled: false,
          });
        }
      }
    }

    // Stop voices for removed notes
    for (const sn of this.scheduledNotes) {
      if (!currentNoteIds.has(sn.note.id)) {
        const channel = this.trackChannels.get(sn.trackId);
        if (channel) {
          const voice = channel.activeVoices.get(sn.note.id);
          if (voice) {
            voice.stop();
            channel.activeVoices.delete(sn.note.id);
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
      };

      // Create voice pool
      for (let i = 0; i < MAX_VOICES_PER_TRACK; i++) {
        channel.voices.push(new VoiceSynthesizer(context, effectsChain.getInput()));
      }

      this.trackChannels.set(track.id, channel);
    }

    // Update effects based on preset + overrides
    const preset = getPresetById(state.presets, track.presetId);
    if (preset) {
      const params = { ...preset.params, ...track.paramOverrides };
      channel.effectsChain.setParams({
        delayTime: params.delayTime,
        delayFeedback: params.delayFeedback,
        delayMix: params.delayMix,
        distortion: params.distortion,
      });
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
      const trackMixer: TrackMixerState = mixer.tracks[trackId] || defaultTrackMixerState;

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
   * Notes are scheduled ~100 ms ahead of the audio clock using a 25 ms
   * polling interval to ensure glitch-free output. If loop mode is enabled,
   * playback will automatically wrap around when it reaches `lengthBeats`.
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
          startScheduled: false,
          endScheduled: false,
        });
      }
    }

    // Start scheduling loop
    this.scheduleIntervalId = setInterval(() => {
      this.scheduleNotes();
      this.updateCurrentBeat();
    }, SCHEDULE_INTERVAL_MS);

    // Initial schedule
    this.scheduleNotes();
  }

  /**
   * Stops playback and silences all active voices immediately.
   *
   * Resets the playhead to beat 0 and fires the beat update callback with `0`.
   * The engine remains initialized and ready to {@link play} again.
   */
  stop(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;

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
    this.beatUpdateCallback?.(0);
  }

  private updateCurrentBeat(): void {
    if (!this.isPlaying) return;

    const context = this.ensureContext();
    const elapsedTime = context.currentTime - this.startTime;
    const elapsedBeats = (elapsedTime * this.tempo) / 60;
    let beat = this.startBeat + elapsedBeats;

    // Handle loop
    if (this.loopEnabled && beat >= this.loopLengthBeats) {
      // Reset for new loop
      beat = beat % this.loopLengthBeats;
      this.startBeat = 0;
      this.startTime = context.currentTime - beatsToSeconds(beat, this.tempo);

      // Reset scheduled notes
      for (const sn of this.scheduledNotes) {
        sn.startScheduled = false;
        sn.endScheduled = false;
      }
    }

    this.currentBeat = beat;
    this.beatUpdateCallback?.(beat);
  }

  private scheduleNotes(): void {
    if (!this.isPlaying || !this.currentState) return;

    const context = this.ensureContext();
    const lookaheadSec = LOOKAHEAD_MS / 1000;
    const currentTime = context.currentTime;
    const lookaheadTime = currentTime + lookaheadSec;

    for (const scheduled of this.scheduledNotes) {
      const { note, trackId } = scheduled;
      const track = this.currentState.tracks.find((t) => t.id === trackId);
      if (!track) continue;

      const channel = this.trackChannels.get(trackId);
      if (!channel) continue;

      const preset = getPresetById(this.currentState.presets, track.presetId);
      if (!preset) continue;

      const params = { ...preset.params, ...track.paramOverrides };

      // Calculate note times
      const noteStartTime = this.startTime + beatsToSeconds(note.startTime - this.startBeat, this.tempo);
      const noteEndTime = noteStartTime + beatsToSeconds(note.duration, this.tempo);

      // Schedule note start
      if (!scheduled.startScheduled && noteStartTime < lookaheadTime && noteStartTime >= currentTime - 0.1) {
        const voice = this.getAvailableVoice(channel);
        if (voice) {
          const voiceParams: VoiceParams = {
            pitch: note.pitch,
            velocity: note.velocity,
            instrument: params,
          };
          voice.noteOn(voiceParams, noteStartTime);
          channel.activeVoices.set(note.id, voice);
        }
        scheduled.startScheduled = true;
      }

      // Schedule note end
      if (!scheduled.endScheduled && scheduled.startScheduled && noteEndTime < lookaheadTime) {
        const voice = channel.activeVoices.get(note.id);
        if (voice) {
          voice.noteOff(params, noteEndTime);
          channel.activeVoices.delete(note.id);
        }
        scheduled.endScheduled = true;
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

    // Voice stealing: use the first voice (oldest)
    const voice = channel.voices[0];
    voice.stop();
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
   * Updated approximately every 25 ms during playback.
   * Subscribe to continuous updates via {@link onBeatUpdate} instead of polling.
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
   * Registers a callback that fires every ~25 ms during playback with the
   * current beat position. Use this to drive a playhead cursor in your UI.
   *
   * Only one callback is active at a time; calling this again replaces the previous one.
   *
   * @param callback - Receives the current beat position (0-based) on each tick,
   *   and is called with `0` when {@link stop} is invoked.
   *
   * @example
   * engine.onBeatUpdate((beat) => {
   *   setPlayheadPosition(beat);
   * });
   */
  onBeatUpdate(callback: (beat: number) => void): void {
    this.beatUpdateCallback = callback;
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

    // Auto release after 0.5 seconds
    setTimeout(() => {
      voice.noteOff(params, context.currentTime);
      setTimeout(() => {
        voice.disconnect();
        tempGain.disconnect();
      }, 1000);
    }, 500);
  }

  /**
   * Stops playback, disconnects all audio nodes, and closes the `AudioContext`.
   *
   * After calling `destroy()`, the engine instance should not be reused.
   * Create a new `AudioEngine` if you need to restart.
   */
  destroy(): void {
    this.stop();

    for (const [id, channel] of this.trackChannels) {
      this.removeTrackChannel(id, channel);
    }

    if (this.context) {
      this.context.close();
      this.context = null;
    }

    this.masterGain = null;
  }
}
