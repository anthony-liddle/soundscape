export interface TrackMixerState {
  volume: number; // 0-1
  mute: boolean;
  solo: boolean;
}

export interface MixerState {
  tracks: Record<string, TrackMixerState>;
  masterVolume: number; // 0-1
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
