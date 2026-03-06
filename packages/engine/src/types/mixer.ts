/** Volume, mute, and solo state for a single track channel. */
export interface TrackMixerState {
  /** Track output volume (0–1). Applied after the instrument's own gain. */
  volume: number;
  /** When `true`, this track is silenced regardless of `volume`. */
  mute: boolean;
  /**
   * When `true`, only soloed tracks produce audio.
   * If any track in the project is soloed, all non-soloed tracks are silenced.
   */
  solo: boolean;
}

/** Mixer state for the full project — one entry per track plus a master volume. */
export interface MixerState {
  /** Per-track mixer settings keyed by track ID. */
  tracks: Record<string, TrackMixerState>;
  /** Master output volume applied to the final mix (0–1). */
  masterVolume: number;
}

export const defaultTrackMixerState: TrackMixerState = {
  volume: 0.8,
  mute: false,
  solo: false,
};

export function createMixerState(): MixerState {
  return {
    tracks: {},
    masterVolume: 0.8,
  };
}
