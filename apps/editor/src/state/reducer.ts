import type {
  SoundscapeState,
  Track,
  Note,
  InstrumentPreset,
  InstrumentParams,
  MixerState,
  TrackMixerState,
} from 'soundscape-engine';
import {
  defaultMetadata,
  defaultTrackMixerState,
  createTrack,
  createNote,
  createPattern,
  createClip,
} from 'soundscape-engine';
import { builtInPresets } from 'soundscape-engine';

// Action types
export type SoundscapeAction =
  | { type: 'SET_STATE'; payload: SoundscapeState }
  | { type: 'SET_METADATA'; payload: Partial<SoundscapeState['metadata']> }
  | { type: 'ADD_TRACK'; payload: { name: string; presetId: string } }
  | { type: 'DUPLICATE_TRACK'; payload: { trackId: string } }
  | { type: 'REMOVE_TRACK'; payload: { trackId: string } }
  | { type: 'UPDATE_TRACK'; payload: { trackId: string; updates: Partial<Omit<Track, 'id' | 'patterns' | 'arrangement'>> } }
  | { type: 'SET_TRACK_PRESET'; payload: { trackId: string; presetId: string } }
  | { type: 'SET_TRACK_PARAM_OVERRIDES'; payload: { trackId: string; overrides: Partial<InstrumentParams> } }
  // Pattern actions
  | { type: 'ADD_PATTERN'; payload: { trackId: string; name: string; lengthBeats: number } }
  | { type: 'DUPLICATE_PATTERN'; payload: { trackId: string; patternId: string } }
  | { type: 'REMOVE_PATTERN'; payload: { trackId: string; patternId: string } }
  | { type: 'RENAME_PATTERN'; payload: { trackId: string; patternId: string; name: string } }
  // Clip actions
  | { type: 'ADD_CLIP'; payload: { trackId: string; patternId: string; startBeat: number } }
  | { type: 'REMOVE_CLIP'; payload: { trackId: string; clipId: string } }
  | { type: 'MOVE_CLIP'; payload: { trackId: string; clipId: string; startBeat: number } }
  // Note actions (now require patternId)
  | { type: 'ADD_NOTE'; payload: { trackId: string; patternId: string; pitch: number; startTime: number; duration?: number; velocity?: number } }
  | { type: 'REMOVE_NOTE'; payload: { trackId: string; patternId: string; noteId: string } }
  | { type: 'UPDATE_NOTE'; payload: { trackId: string; patternId: string; noteId: string; updates: Partial<Omit<Note, 'id'>> } }
  | { type: 'CLEAR_PATTERN_NOTES'; payload: { trackId: string; patternId: string } }
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
      const patternIdMap = new Map<string, string>(
        sourceTrk.patterns.map((p) => [p.id, crypto.randomUUID()])
      );
      const duplicatedTrack: Track = {
        id: newId,
        name: `${sourceTrk.name} - copy`,
        presetId: sourceTrk.presetId,
        patterns: sourceTrk.patterns.map((p) => ({
          ...p,
          id: patternIdMap.get(p.id)!,
          notes: p.notes.map((n) => ({ ...n, id: crypto.randomUUID() })),
        })),
        arrangement: sourceTrk.arrangement.map((c) => ({
          ...c,
          id: crypto.randomUUID(),
          patternId: patternIdMap.get(c.patternId)!,
        })),
        ...(sourceTrk.paramOverrides && { paramOverrides: { ...sourceTrk.paramOverrides } }),
      };
      const sourceMixer = state.mixer.tracks[sourceTrk.id] || defaultTrackMixerState;
      return {
        ...state,
        tracks: [...state.tracks, duplicatedTrack],
        mixer: {
          ...state.mixer,
          tracks: { ...state.mixer.tracks, [newId]: { ...sourceMixer } },
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
        tracks: state.tracks.map((t) => {
          if (t.id !== trackId) return t;
          // Omit paramOverrides entirely (reset to preset defaults) by destructuring it out
          const { paramOverrides: _unused, ...rest } = t;
          void _unused;
          return { ...rest, presetId };
        }),
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

    case 'ADD_PATTERN': {
      const { trackId, name, lengthBeats } = action.payload;
      const newPattern = createPattern(name, lengthBeats);
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, patterns: [...t.patterns, newPattern] } : t
        ),
      };
    }

    case 'DUPLICATE_PATTERN': {
      const { trackId, patternId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const source = t.patterns.find((p) => p.id === patternId);
          if (!source) return t;
          const copy = {
            ...source,
            id: crypto.randomUUID(),
            name: `${source.name} (copy)`,
            notes: source.notes.map((n) => ({ ...n, id: crypto.randomUUID() })),
          };
          return { ...t, patterns: [...t.patterns, copy] };
        }),
      };
    }

    case 'REMOVE_PATTERN': {
      const { trackId, patternId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) => {
          if (t.id !== trackId) return t;
          if (t.patterns.length <= 1) return t;
          return {
            ...t,
            patterns: t.patterns.filter((p) => p.id !== patternId),
            arrangement: t.arrangement.filter((c) => c.patternId !== patternId),
          };
        }),
      };
    }

    case 'RENAME_PATTERN': {
      const { trackId, patternId, name } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== trackId
            ? t
            : { ...t, patterns: t.patterns.map((p) => p.id === patternId ? { ...p, name } : p) }
        ),
      };
    }

    case 'ADD_CLIP': {
      const { trackId, patternId, startBeat } = action.payload;
      const newClip = createClip(patternId, startBeat);
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, arrangement: [...t.arrangement, newClip] } : t
        ),
      };
    }

    case 'REMOVE_CLIP': {
      const { trackId, clipId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, arrangement: t.arrangement.filter((c) => c.id !== clipId) }
            : t
        ),
      };
    }

    case 'MOVE_CLIP': {
      const { trackId, clipId, startBeat } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== trackId
            ? t
            : { ...t, arrangement: t.arrangement.map((c) => c.id === clipId ? { ...c, startBeat } : c) }
        ),
      };
    }

    case 'ADD_NOTE': {
      const { trackId, patternId, pitch, startTime, duration = 1, velocity = 100 } = action.payload;
      const newNote = createNote(pitch, startTime, duration, velocity);
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== trackId
            ? t
            : { ...t, patterns: t.patterns.map((p) => p.id === patternId ? { ...p, notes: [...p.notes, newNote] } : p) }
        ),
      };
    }

    case 'REMOVE_NOTE': {
      const { trackId, patternId, noteId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== trackId
            ? t
            : { ...t, patterns: t.patterns.map((p) => p.id === patternId ? { ...p, notes: p.notes.filter((n) => n.id !== noteId) } : p) }
        ),
      };
    }

    case 'UPDATE_NOTE': {
      const { trackId, patternId, noteId, updates } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== trackId
            ? t
            : {
                ...t,
                patterns: t.patterns.map((p) =>
                  p.id !== patternId
                    ? p
                    : { ...p, notes: p.notes.map((n) => n.id === noteId ? { ...n, ...updates } : n) }
                ),
              }
        ),
      };
    }

    case 'CLEAR_PATTERN_NOTES': {
      const { trackId, patternId } = action.payload;
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== trackId
            ? t
            : { ...t, patterns: t.patterns.map((p) => p.id === patternId ? { ...p, notes: [] } : p) }
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
