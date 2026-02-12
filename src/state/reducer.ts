import type {
  SoundscapeState,
  Track,
  Note,
  InstrumentPreset,
  InstrumentParams,
  MixerState,
  TrackMixerState,
} from '../types';
import {
  defaultMetadata,
  defaultTrackMixerState,
  createTrack,
  createNote,
} from '../types';
import { builtInPresets } from '../presets';

// Action types
export type SoundscapeAction =
  | { type: 'SET_STATE'; payload: SoundscapeState }
  | { type: 'SET_METADATA'; payload: Partial<SoundscapeState['metadata']> }
  | { type: 'ADD_TRACK'; payload: { name: string; presetId: string } }
  | { type: 'DUPLICATE_TRACK'; payload: { trackId: string } }
  | { type: 'REMOVE_TRACK'; payload: { trackId: string } }
  | { type: 'UPDATE_TRACK'; payload: { trackId: string; updates: Partial<Omit<Track, 'id' | 'notes'>> } }
  | { type: 'SET_TRACK_PRESET'; payload: { trackId: string; presetId: string } }
  | { type: 'SET_TRACK_PARAM_OVERRIDES'; payload: { trackId: string; overrides: Partial<InstrumentParams> } }
  | { type: 'ADD_NOTE'; payload: { trackId: string; pitch: number; startTime: number; duration?: number; velocity?: number } }
  | { type: 'REMOVE_NOTE'; payload: { trackId: string; noteId: string } }
  | { type: 'UPDATE_NOTE'; payload: { trackId: string; noteId: string; updates: Partial<Omit<Note, 'id'>> } }
  | { type: 'CLEAR_TRACK_NOTES'; payload: { trackId: string } }
  | { type: 'ADD_PRESET'; payload: InstrumentPreset }
  | { type: 'REMOVE_PRESET'; payload: { presetId: string } }
  | { type: 'UPDATE_PRESET'; payload: { presetId: string; updates: Partial<Omit<InstrumentPreset, 'id' | 'isBuiltIn'>> } }
  | { type: 'SET_MIXER_TRACK'; payload: { trackId: string; state: Partial<TrackMixerState> } }
  | { type: 'SET_MASTER_VOLUME'; payload: number }
  | { type: 'APPLY_MIXER_STATE'; payload: Partial<MixerState> };

export function createInitialState(): SoundscapeState {
  const initialTrack = createTrack('Track 1', 'lead');

  return {
    metadata: { ...defaultMetadata },
    tracks: [initialTrack],
    presets: [...builtInPresets],
    mixer: {
      tracks: {
        [initialTrack.id]: { ...defaultTrackMixerState },
      },
      masterVolume: 0.8,
    },
  };
}

export function soundscapeReducer(state: SoundscapeState, action: SoundscapeAction): SoundscapeState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload;

    case 'SET_METADATA':
      return {
        ...state,
        metadata: { ...state.metadata, ...action.payload },
      };

    case 'ADD_TRACK': {
      const newTrack = createTrack(action.payload.name, action.payload.presetId);
      return {
        ...state,
        tracks: [...state.tracks, newTrack],
        mixer: {
          ...state.mixer,
          tracks: {
            ...state.mixer.tracks,
            [newTrack.id]: { ...defaultTrackMixerState },
          },
        },
      };
    }

    case 'DUPLICATE_TRACK': {
      const sourceTrk = state.tracks.find((t) => t.id === action.payload.trackId);
      if (!sourceTrk) return state;
      const newId = crypto.randomUUID();
      const duplicatedTrack: Track = {
        id: newId,
        name: `${sourceTrk.name} - copy`,
        presetId: sourceTrk.presetId,
        notes: sourceTrk.notes.map((n) => ({ ...n, id: crypto.randomUUID() })),
        paramOverrides: sourceTrk.paramOverrides
          ? { ...sourceTrk.paramOverrides }
          : undefined,
      };
      const sourceMixer = state.mixer.tracks[sourceTrk.id] || defaultTrackMixerState;
      return {
        ...state,
        tracks: [...state.tracks, duplicatedTrack],
        mixer: {
          ...state.mixer,
          tracks: {
            ...state.mixer.tracks,
            [newId]: { ...sourceMixer },
          },
        },
      };
    }

    case 'REMOVE_TRACK': {
      const { trackId } = action.payload;
      const { [trackId]: _removed, ...remainingTracks } = state.mixer.tracks;
      void _removed; // Intentionally unused - destructuring to exclude trackId
      return {
        ...state,
        tracks: state.tracks.filter((t) => t.id !== trackId),
        mixer: {
          ...state.mixer,
          tracks: remainingTracks,
        },
      };
    }

    case 'UPDATE_TRACK': {
      const { trackId, updates } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, ...updates } : t
        ),
      };
    }

    case 'SET_TRACK_PRESET': {
      const { trackId, presetId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, presetId, paramOverrides: undefined } : t
        ),
      };
    }

    case 'SET_TRACK_PARAM_OVERRIDES': {
      const { trackId, overrides } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, paramOverrides: { ...t.paramOverrides, ...overrides } }
            : t
        ),
      };
    }

    case 'ADD_NOTE': {
      const { trackId, pitch, startTime, duration = 1, velocity = 100 } = action.payload;
      const newNote = createNote(pitch, startTime, duration, velocity);
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, notes: [...t.notes, newNote] } : t
        ),
      };
    }

    case 'REMOVE_NOTE': {
      const { trackId, noteId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, notes: t.notes.filter((n) => n.id !== noteId) }
            : t
        ),
      };
    }

    case 'UPDATE_NOTE': {
      const { trackId, noteId, updates } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                notes: t.notes.map((n) =>
                  n.id === noteId ? { ...n, ...updates } : n
                ),
              }
            : t
        ),
      };
    }

    case 'CLEAR_TRACK_NOTES': {
      const { trackId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, notes: [] } : t
        ),
      };
    }

    case 'ADD_PRESET':
      return {
        ...state,
        presets: [...state.presets, action.payload],
      };

    case 'REMOVE_PRESET': {
      const { presetId } = action.payload;
      // Don't remove built-in presets
      const preset = state.presets.find((p) => p.id === presetId);
      if (preset?.isBuiltIn) return state;
      return {
        ...state,
        presets: state.presets.filter((p) => p.id !== presetId),
      };
    }

    case 'UPDATE_PRESET': {
      const { presetId, updates } = action.payload;
      return {
        ...state,
        presets: state.presets.map((p) =>
          p.id === presetId && !p.isBuiltIn ? { ...p, ...updates } : p
        ),
      };
    }

    case 'SET_MIXER_TRACK': {
      const { trackId, state: trackState } = action.payload;
      return {
        ...state,
        mixer: {
          ...state.mixer,
          tracks: {
            ...state.mixer.tracks,
            [trackId]: {
              ...(state.mixer.tracks[trackId] || defaultTrackMixerState),
              ...trackState,
            },
          },
        },
      };
    }

    case 'SET_MASTER_VOLUME':
      return {
        ...state,
        mixer: {
          ...state.mixer,
          masterVolume: action.payload,
        },
      };

    case 'APPLY_MIXER_STATE': {
      const { tracks, masterVolume } = action.payload;
      return {
        ...state,
        mixer: {
          ...state.mixer,
          masterVolume: masterVolume ?? state.mixer.masterVolume,
          tracks: tracks
            ? Object.entries(tracks).reduce(
                (acc, [trackId, trackState]) => ({
                  ...acc,
                  [trackId]: {
                    ...(state.mixer.tracks[trackId] || defaultTrackMixerState),
                    ...trackState,
                  },
                }),
                state.mixer.tracks
              )
            : state.mixer.tracks,
        },
      };
    }

    default:
      return state;
  }
}
