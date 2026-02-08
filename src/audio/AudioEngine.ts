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
  private scheduleIntervalId: number | null = null;
  private beatUpdateCallback: ((beat: number) => void) | null = null;

  private currentState: SoundscapeState | null = null;

  async initialize(): Promise<void> {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.masterGain.gain.value = 0.8;
  }

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

  updateState(state: SoundscapeState): void {
    this.currentState = state;
    this.tempo = state.metadata.tempo;
    this.loopLengthBeats = state.metadata.lengthBeats;

    // Update mixer
    this.updateMixer(state.mixer);

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
    this.scheduleIntervalId = window.setInterval(() => {
      this.scheduleNotes();
      this.updateCurrentBeat();
    }, SCHEDULE_INTERVAL_MS);

    // Initial schedule
    this.scheduleNotes();
  }

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

  setLoop(enabled: boolean): void {
    this.loopEnabled = enabled;
  }

  setLoopLength(beats: number): void {
    this.loopLengthBeats = beats;
  }

  getCurrentBeat(): number {
    return this.currentBeat;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  onBeatUpdate(callback: (beat: number) => void): void {
    this.beatUpdateCallback = callback;
  }

  // Preview a single note (for editing)
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
