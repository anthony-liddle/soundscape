import type { MixerState, InstrumentParams } from '../types';
import type { SoundscapeAction } from '../state/reducer';
import type { Dispatch } from 'react';

export interface SoundscapeRuntimeAPI {
  /**
   * Apply partial mixer state changes
   * @example
   * applyMixerState({
   *   tracks: { 'track-1': { volume: 0.5, mute: false } },
   *   masterVolume: 0.8
   * });
   */
  applyMixerState: (partialMixer: Partial<MixerState>) => void;

  /**
   * Apply instrument parameter overrides to a track
   * @example
   * applyInstrumentOverride('track-1', {
   *   filterCutoff: 0.3,
   *   delayMix: 0.5
   * });
   */
  applyInstrumentOverride: (trackId: string, overrides: Partial<InstrumentParams>) => void;

  /**
   * Start playback
   * @param startBeat Optional beat to start from
   */
  play: (startBeat?: number) => void;

  /**
   * Stop playback
   */
  stop: () => void;

  /**
   * Set tempo (BPM)
   */
  setTempo: (bpm: number) => void;

  /**
   * Enable/disable loop
   */
  setLoop: (enabled: boolean) => void;

  /**
   * Get current playback state
   */
  getPlaybackState: () => { isPlaying: boolean; currentBeat: number; loop: boolean };

  /**
   * Get current mixer state
   */
  getMixerState: () => MixerState;

  /**
   * Mute a specific track
   */
  muteTrack: (trackId: string, muted: boolean) => void;

  /**
   * Solo a specific track
   */
  soloTrack: (trackId: string, soloed: boolean) => void;

  /**
   * Set track volume (0-1)
   */
  setTrackVolume: (trackId: string, volume: number) => void;

  /**
   * Set master volume (0-1)
   */
  setMasterVolume: (volume: number) => void;
}

/**
 * Create a runtime API instance for game integration
 */
export function createRuntimeAPI(
  dispatch: Dispatch<SoundscapeAction>,
  getState: () => {
    mixer: MixerState;
    playback: { isPlaying: boolean; currentBeat: number; loop: boolean };
  },
  controls: {
    play: (startBeat?: number) => void;
    stop: () => void;
    setTempo: (bpm: number) => void;
    setLoop: (enabled: boolean) => void;
  }
): SoundscapeRuntimeAPI {
  return {
    applyMixerState: (partialMixer: Partial<MixerState>) => {
      dispatch({ type: 'APPLY_MIXER_STATE', payload: partialMixer });
    },

    applyInstrumentOverride: (trackId: string, overrides: Partial<InstrumentParams>) => {
      dispatch({
        type: 'SET_TRACK_PARAM_OVERRIDES',
        payload: { trackId, overrides },
      });
    },

    play: controls.play,
    stop: controls.stop,
    setTempo: controls.setTempo,
    setLoop: controls.setLoop,

    getPlaybackState: () => getState().playback,
    getMixerState: () => getState().mixer,

    muteTrack: (trackId: string, muted: boolean) => {
      dispatch({
        type: 'SET_MIXER_TRACK',
        payload: { trackId, state: { mute: muted } },
      });
    },

    soloTrack: (trackId: string, soloed: boolean) => {
      dispatch({
        type: 'SET_MIXER_TRACK',
        payload: { trackId, state: { solo: soloed } },
      });
    },

    setTrackVolume: (trackId: string, volume: number) => {
      dispatch({
        type: 'SET_MIXER_TRACK',
        payload: { trackId, state: { volume } },
      });
    },

    setMasterVolume: (volume: number) => {
      dispatch({ type: 'SET_MASTER_VOLUME', payload: volume });
    },
  };
}
