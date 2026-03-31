import {
  createNote, createTrack, builtInPresets, defaultMetadata,
  defaultTrackMixerState,
  createPattern, createClip,
} from 'soundscape-engine';
import type {
  SoundscapeState, Track, Note, InstrumentPreset, TrackMixerState,
  MixerState, InstrumentParams, Pattern,
} from 'soundscape-engine';

// Action types
export type SoundscapeAction =
  | { type: 'SET_STATE'; payload: SoundscapeState }
  | { type: 'SET_METADATA'; payload: Partial<SoundscapeState['metadata']> }
  | { type: 'ADD_TRACK'; payload: { name: string; presetId: string } }
  | { type: 'DUPLICATE_TRACK'; payload: { trackId: string } }
  | { type: 'REMOVE_TRACK'; payload: { trackId: string } }
  | { type: 'UPDATE_TRACK'; payload: { trackId: string; updates: Partial<Omit<Track, 'id'>> } }
  | { type: 'SET_TRACK_PRESET'; payload: { trackId: string; presetId: string } }
  | { type: 'SET_TRACK_PARAM_OVERRIDES'; payload: { trackId: string; overrides: Partial<InstrumentParams> } }
  // Pattern actions (global sections — not per-track)
  | { type: 'ADD_PATTERN'; payload: { name: string; lengthBeats: number } }
  | { type: 'REMOVE_PATTERN'; payload: { patternId: string } }
  | { type: 'RENAME_PATTERN'; payload: { patternId: string; name: string } }
  | { type: 'DUPLICATE_PATTERN'; payload: { patternId: string } }
  | { type: 'COPY_TRACK_TO_PATTERN'; payload: { sourcePatternId: string; targetPatternId: string; trackId: string } }
  // Arrangement actions (global timeline)
  | { type: 'ADD_CLIP'; payload: { patternId: string; startBeat: number } }
  | { type: 'REMOVE_CLIP'; payload: { clipId: string } }
  | { type: 'MOVE_CLIP'; payload: { clipId: string; startBeat: number } }
  // Note actions — scoped to a pattern + track
  | { type: 'ADD_NOTE'; payload: { patternId: string; trackId: string; pitch: number; startTime: number; duration?: number; velocity?: number } }
  | { type: 'REMOVE_NOTE'; payload: { patternId: string; trackId: string; noteId: string } }
  | { type: 'UPDATE_NOTE'; payload: { patternId: string; trackId: string; noteId: string; updates: Partial<Omit<Note, 'id'>> } }
  | { type: 'CLEAR_PATTERN_TRACK_NOTES'; payload: { patternId: string; trackId: string } }
  | { type: 'ADD_PRESET'; payload: InstrumentPreset }
  | { type: 'REMOVE_PRESET'; payload: { presetId: string } }
  | { type: 'UPDATE_PRESET'; payload: { presetId: string; updates: Partial<Omit<InstrumentPreset, 'id' | 'isBuiltIn'>> } }
  | { type: 'SET_MIXER_TRACK'; payload: { trackId: string; state: Partial<TrackMixerState> } }
  | { type: 'SET_MASTER_VOLUME'; payload: number }
  | { type: 'APPLY_MIXER_STATE'; payload: Partial<MixerState> };

export function createInitialState(): SoundscapeState {
  const initialTrack = createTrack('Track 1', 'lead');
  const initialPattern = createPattern('Pattern 1', 16);
  const initialClip = createClip(initialPattern.id, 0);
  return {
    metadata: { ...defaultMetadata },
    tracks: [initialTrack],
    patterns: [initialPattern],
    arrangement: [initialClip],
    presets: [...builtInPresets],
    mixer: {
      tracks: { [initialTrack.id]: { ...defaultTrackMixerState } },
      masterVolume: 0.8,
    },
  };
}

function updatePattern(
  patterns: Pattern[],
  patternId: string,
  fn: (p: Pattern) => Pattern
): Pattern[] {
  return patterns.map((p) => (p.id === patternId ? fn(p) : p));
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
        ...(sourceTrk.paramOverrides && { paramOverrides: { ...sourceTrk.paramOverrides } }),
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
      const { name, lengthBeats } = action.payload;
      return { ...state, patterns: [...state.patterns, createPattern(name, lengthBeats)] };
    }

    case 'REMOVE_PATTERN': {
      const { patternId } = action.payload;
      if (state.patterns.length <= 1) return state;
      return {
        ...state,
        patterns: state.patterns.filter((p) => p.id !== patternId),
        arrangement: state.arrangement.filter((c) => c.patternId !== patternId),
      };
    }

    case 'RENAME_PATTERN': {
      const { patternId, name } = action.payload;
      return {
        ...state,
        patterns: updatePattern(state.patterns, patternId, (p) => ({ ...p, name })),
      };
    }

    case 'DUPLICATE_PATTERN': {
      const { patternId } = action.payload;
      const source = state.patterns.find((p) => p.id === patternId);
      if (!source) return state;
      const copy: Pattern = {
        id: crypto.randomUUID(),
        name: `${source.name} (copy)`,
        lengthBeats: source.lengthBeats,
        trackNotes: Object.fromEntries(
          Object.entries(source.trackNotes).map(([tid, notes]) => [
            tid,
            notes.map((n) => ({ ...n, id: crypto.randomUUID() })),
          ])
        ),
      };
      return { ...state, patterns: [...state.patterns, copy] };
    }

    case 'COPY_TRACK_TO_PATTERN': {
      const { sourcePatternId, targetPatternId, trackId } = action.payload;
      const source = state.patterns.find((p) => p.id === sourcePatternId);
      if (!source) return state;
      const sourceNotes = source.trackNotes[trackId] ?? [];
      const copiedNotes = sourceNotes.map((n) => ({ ...n, id: crypto.randomUUID() }));
      return {
        ...state,
        patterns: updatePattern(state.patterns, targetPatternId, (p) => ({
          ...p,
          trackNotes: { ...p.trackNotes, [trackId]: copiedNotes },
        })),
      };
    }

    case 'ADD_CLIP': {
      const { patternId, startBeat } = action.payload;
      return { ...state, arrangement: [...state.arrangement, createClip(patternId, startBeat)] };
    }

    case 'REMOVE_CLIP': {
      const { clipId } = action.payload;
      return { ...state, arrangement: state.arrangement.filter((c) => c.id !== clipId) };
    }

    case 'MOVE_CLIP': {
      const { clipId, startBeat } = action.payload;
      return {
        ...state,
        arrangement: state.arrangement.map((c) => (c.id === clipId ? { ...c, startBeat } : c)),
      };
    }

    case 'ADD_NOTE': {
      const { patternId, trackId, pitch, startTime, duration = 1, velocity = 100 } = action.payload;
      const newNote = createNote(pitch, startTime, duration, velocity);
      return {
        ...state,
        patterns: updatePattern(state.patterns, patternId, (p) => ({
          ...p,
          trackNotes: {
            ...p.trackNotes,
            [trackId]: [...(p.trackNotes[trackId] ?? []), newNote],
          },
        })),
      };
    }

    case 'REMOVE_NOTE': {
      const { patternId, trackId, noteId } = action.payload;
      return {
        ...state,
        patterns: updatePattern(state.patterns, patternId, (p) => ({
          ...p,
          trackNotes: {
            ...p.trackNotes,
            [trackId]: (p.trackNotes[trackId] ?? []).filter((n) => n.id !== noteId),
          },
        })),
      };
    }

    case 'UPDATE_NOTE': {
      const { patternId, trackId, noteId, updates } = action.payload;
      return {
        ...state,
        patterns: updatePattern(state.patterns, patternId, (p) => ({
          ...p,
          trackNotes: {
            ...p.trackNotes,
            [trackId]: (p.trackNotes[trackId] ?? []).map((n) =>
              n.id === noteId ? { ...n, ...updates } : n
            ),
          },
        })),
      };
    }

    case 'CLEAR_PATTERN_TRACK_NOTES': {
      const { patternId, trackId } = action.payload;
      return {
        ...state,
        patterns: updatePattern(state.patterns, patternId, (p) => ({
          ...p,
          trackNotes: { ...p.trackNotes, [trackId]: [] },
        })),
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
