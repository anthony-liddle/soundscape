import { describe, it, expect, beforeEach } from 'vitest'
import { resetMockUuid } from '../../test/setup'
import { soundscapeReducer, createInitialState } from '../reducer'
import type { SoundscapeState } from 'soundscape-engine'

describe('soundscape reducer', () => {
  beforeEach(() => {
    resetMockUuid()
  })

  describe('createInitialState', () => {
    it('creates state with default metadata', () => {
      const state = createInitialState()
      expect(state.metadata.name).toBe('Untitled Soundscape')
      expect(state.metadata.tempo).toBe(120)
      expect(state.metadata.timeSignature).toEqual([4, 4])
      expect(state.metadata.lengthBeats).toBe(16)
    })

    it('creates state with one initial track', () => {
      const state = createInitialState()
      expect(state.tracks).toHaveLength(1)
      expect(state.tracks[0].name).toBe('Track 1')
      expect(state.tracks[0].presetId).toBe('lead')
    })

    it('creates mixer state for initial track', () => {
      const state = createInitialState()
      const trackId = state.tracks[0].id
      expect(state.mixer.tracks[trackId]).toBeDefined()
      expect(state.mixer.masterVolume).toBe(0.8)
    })

    it('includes built-in presets', () => {
      const state = createInitialState()
      expect(state.presets.length).toBeGreaterThan(0)
      expect(state.presets.some((p) => p.id === 'lead')).toBe(true)
    })
  })

  describe('SET_STATE', () => {
    it('replaces entire state', () => {
      const initialState = createInitialState()
      const newState: SoundscapeState = {
        ...initialState,
        metadata: { ...initialState.metadata, name: 'New Name' },
      }
      const result = soundscapeReducer(initialState, {
        type: 'SET_STATE',
        payload: newState,
      })
      expect(result).toBe(newState)
    })
  })

  describe('SET_METADATA', () => {
    it('updates metadata partially', () => {
      const initialState = createInitialState()
      const result = soundscapeReducer(initialState, {
        type: 'SET_METADATA',
        payload: { name: 'Updated Name', tempo: 140 },
      })
      expect(result.metadata.name).toBe('Updated Name')
      expect(result.metadata.tempo).toBe(140)
      expect(result.metadata.lengthBeats).toBe(16)
    })
  })

  describe('ADD_TRACK', () => {
    it('adds a new track', () => {
      const initialState = createInitialState()
      const result = soundscapeReducer(initialState, {
        type: 'ADD_TRACK',
        payload: { name: 'New Track', presetId: 'bass' },
      })
      expect(result.tracks).toHaveLength(2)
      expect(result.tracks[1].name).toBe('New Track')
      expect(result.tracks[1].presetId).toBe('bass')
    })

    it('creates mixer state for new track', () => {
      const initialState = createInitialState()
      const result = soundscapeReducer(initialState, {
        type: 'ADD_TRACK',
        payload: { name: 'New Track', presetId: 'bass' },
      })
      const newTrackId = result.tracks[1].id
      expect(result.mixer.tracks[newTrackId]).toBeDefined()
    })
  })

  describe('REMOVE_TRACK', () => {
    it('removes a track', () => {
      let state = createInitialState()
      state = soundscapeReducer(state, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      const trackToRemove = state.tracks[1].id

      const result = soundscapeReducer(state, {
        type: 'REMOVE_TRACK',
        payload: { trackId: trackToRemove },
      })
      expect(result.tracks).toHaveLength(1)
      expect(result.tracks.find((t) => t.id === trackToRemove)).toBeUndefined()
    })

    it('removes mixer state for removed track', () => {
      let state = createInitialState()
      state = soundscapeReducer(state, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      const trackToRemove = state.tracks[1].id

      const result = soundscapeReducer(state, {
        type: 'REMOVE_TRACK',
        payload: { trackId: trackToRemove },
      })
      expect(result.mixer.tracks[trackToRemove]).toBeUndefined()
    })
  })

  describe('DUPLICATE_TRACK', () => {
    it('duplicates a track with a new id and name', () => {
      const state = createInitialState()
      const sourceId = state.tracks[0].id

      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: sourceId },
      })
      expect(result.tracks).toHaveLength(2)
      expect(result.tracks[1].name).toBe('Track 1 - copy')
      expect(result.tracks[1].id).not.toBe(sourceId)
      expect(result.tracks[1].presetId).toBe(state.tracks[0].presetId)
    })

    it('copies patterns and notes with new ids', () => {
      let state = createInitialState()
      const sourceId = state.tracks[0].id
      const patternId = state.tracks[0].patterns[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId: sourceId, patternId, pitch: 60, startTime: 0, duration: 2, velocity: 90 },
      })
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId: sourceId, patternId, pitch: 64, startTime: 2, duration: 1, velocity: 100 },
      })

      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: sourceId },
      })
      const copied = result.tracks[1]
      expect(copied.patterns).toHaveLength(1)
      expect(copied.patterns[0].notes).toHaveLength(2)
      expect(copied.patterns[0].notes[0].pitch).toBe(60)
      expect(copied.patterns[0].notes[0].duration).toBe(2)
      expect(copied.patterns[0].notes[0].velocity).toBe(90)
      expect(copied.patterns[0].notes[1].pitch).toBe(64)
      // All note ids should be new
      expect(copied.patterns[0].notes[0].id).not.toBe(state.tracks[0].patterns[0].notes[0].id)
      expect(copied.patterns[0].notes[1].id).not.toBe(state.tracks[0].patterns[0].notes[1].id)
    })

    it('copies arrangement with remapped patternIds', () => {
      const state = createInitialState()
      const sourceId = state.tracks[0].id

      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: sourceId },
      })
      const originalArrangement = state.tracks[0].arrangement
      const copiedArrangement = result.tracks[1].arrangement
      expect(copiedArrangement).toHaveLength(originalArrangement.length)
      // clip id should be new
      expect(copiedArrangement[0].id).not.toBe(originalArrangement[0].id)
      // patternId should be remapped (not the original)
      expect(copiedArrangement[0].patternId).not.toBe(originalArrangement[0].patternId)
      // patternId should match the new pattern
      expect(copiedArrangement[0].patternId).toBe(result.tracks[1].patterns[0].id)
    })

    it('copies paramOverrides', () => {
      let state = createInitialState()
      const sourceId = state.tracks[0].id
      state = soundscapeReducer(state, {
        type: 'SET_TRACK_PARAM_OVERRIDES',
        payload: { trackId: sourceId, overrides: { attack: 0.5, decay: 0.3 } },
      })

      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: sourceId },
      })
      expect(result.tracks[1].paramOverrides).toEqual({ attack: 0.5, decay: 0.3 })
      // Should be a separate object, not the same reference
      expect(result.tracks[1].paramOverrides).not.toBe(state.tracks[0].paramOverrides)
    })

    it('copies mixer state', () => {
      let state = createInitialState()
      const sourceId = state.tracks[0].id
      state = soundscapeReducer(state, {
        type: 'SET_MIXER_TRACK',
        payload: { trackId: sourceId, state: { volume: 0.6, mute: true } },
      })

      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: sourceId },
      })
      const newId = result.tracks[1].id
      expect(result.mixer.tracks[newId]).toBeDefined()
      expect(result.mixer.tracks[newId].volume).toBe(0.6)
      expect(result.mixer.tracks[newId].mute).toBe(true)
    })

    it('duplicate without paramOverrides has no paramOverrides property', () => {
      const state = createInitialState()
      const sourceId = state.tracks[0].id

      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: sourceId },
      })
      expect(result.tracks[1].paramOverrides).toBeUndefined()
      expect('paramOverrides' in result.tracks[1]).toBe(false)
    })

    it('returns unchanged state for non-existent track', () => {
      const state = createInitialState()
      const result = soundscapeReducer(state, {
        type: 'DUPLICATE_TRACK',
        payload: { trackId: 'non-existent' },
      })
      expect(result).toBe(state)
    })
  })

  describe('SET_TRACK_PRESET', () => {
    it('updates the preset id', () => {
      const state = createInitialState()
      const trackId = state.tracks[0].id

      const result = soundscapeReducer(state, {
        type: 'SET_TRACK_PRESET',
        payload: { trackId, presetId: 'bass' },
      })
      expect(result.tracks[0].presetId).toBe('bass')
    })

    it('clears paramOverrides when preset changes', () => {
      let state = createInitialState()
      const trackId = state.tracks[0].id
      state = soundscapeReducer(state, {
        type: 'SET_TRACK_PARAM_OVERRIDES',
        payload: { trackId, overrides: { attack: 0.9, decay: 0.1 } },
      })
      expect(state.tracks[0].paramOverrides).toBeDefined()

      const result = soundscapeReducer(state, {
        type: 'SET_TRACK_PRESET',
        payload: { trackId, presetId: 'bass' },
      })
      expect(result.tracks[0].paramOverrides).toBeUndefined()
      expect('paramOverrides' in result.tracks[0]).toBe(false)
    })

    it('does not affect other tracks', () => {
      let state = createInitialState()
      state = soundscapeReducer(state, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      const track1Id = state.tracks[0].id
      const track2Id = state.tracks[1].id

      const result = soundscapeReducer(state, {
        type: 'SET_TRACK_PRESET',
        payload: { trackId: track1Id, presetId: 'pad' },
      })
      expect(result.tracks[1].id).toBe(track2Id)
      expect(result.tracks[1].presetId).toBe('bass')
    })
  })

  describe('ADD_NOTE', () => {
    it('adds a note to a track pattern', () => {
      const initialState = createInitialState()
      const trackId = initialState.tracks[0].id
      const patternId = initialState.tracks[0].patterns[0]!.id
      const result = soundscapeReducer(initialState, {
        type: 'ADD_NOTE',
        payload: { trackId, patternId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      })
      expect(result.tracks[0].patterns[0].notes).toHaveLength(1)
      expect(result.tracks[0].patterns[0].notes[0].pitch).toBe(60)
    })

    it('uses default duration and velocity', () => {
      const initialState = createInitialState()
      const trackId = initialState.tracks[0].id
      const patternId = initialState.tracks[0].patterns[0]!.id
      const result = soundscapeReducer(initialState, {
        type: 'ADD_NOTE',
        payload: { trackId, patternId, pitch: 60, startTime: 0 },
      })
      expect(result.tracks[0].patterns[0].notes[0].duration).toBe(1)
      expect(result.tracks[0].patterns[0].notes[0].velocity).toBe(100)
    })
  })

  describe('REMOVE_NOTE', () => {
    it('removes a note from a track pattern', () => {
      let state = createInitialState()
      const trackId = state.tracks[0].id
      const patternId = state.tracks[0].patterns[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId, patternId, pitch: 60, startTime: 0 },
      })
      const noteId = state.tracks[0].patterns[0].notes[0].id

      const result = soundscapeReducer(state, {
        type: 'REMOVE_NOTE',
        payload: { trackId, patternId, noteId },
      })
      expect(result.tracks[0].patterns[0].notes).toHaveLength(0)
    })
  })

  describe('UPDATE_NOTE', () => {
    it('updates note properties', () => {
      let state = createInitialState()
      const trackId = state.tracks[0].id
      const patternId = state.tracks[0].patterns[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId, patternId, pitch: 60, startTime: 0 },
      })
      const noteId = state.tracks[0].patterns[0].notes[0].id

      const result = soundscapeReducer(state, {
        type: 'UPDATE_NOTE',
        payload: { trackId, patternId, noteId, updates: { pitch: 72, duration: 2 } },
      })
      expect(result.tracks[0].patterns[0].notes[0].pitch).toBe(72)
      expect(result.tracks[0].patterns[0].notes[0].duration).toBe(2)
    })
  })

  describe('SET_MIXER_TRACK', () => {
    it('updates mixer track state', () => {
      const initialState = createInitialState()
      const trackId = initialState.tracks[0].id
      const result = soundscapeReducer(initialState, {
        type: 'SET_MIXER_TRACK',
        payload: { trackId, state: { volume: 0.5, mute: true } },
      })
      expect(result.mixer.tracks[trackId].volume).toBe(0.5)
      expect(result.mixer.tracks[trackId].mute).toBe(true)
    })

    it('preserves other mixer track properties', () => {
      const initialState = createInitialState()
      const trackId = initialState.tracks[0].id
      const result = soundscapeReducer(initialState, {
        type: 'SET_MIXER_TRACK',
        payload: { trackId, state: { volume: 0.5 } },
      })
      expect(result.mixer.tracks[trackId].mute).toBe(false)
      expect(result.mixer.tracks[trackId].solo).toBe(false)
    })
  })

  describe('SET_MASTER_VOLUME', () => {
    it('updates master volume', () => {
      const initialState = createInitialState()
      const result = soundscapeReducer(initialState, {
        type: 'SET_MASTER_VOLUME',
        payload: 0.5,
      })
      expect(result.mixer.masterVolume).toBe(0.5)
    })
  })

  describe('default case', () => {
    it('returns unchanged state for unknown action', () => {
      const initialState = createInitialState()
      const result = soundscapeReducer(initialState, {
        type: 'UNKNOWN_ACTION' as never,
      })
      expect(result).toBe(initialState)
    })
  })

  describe('pattern actions', () => {
    it('ADD_PATTERN adds a pattern to the track', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const result = soundscapeReducer(state, {
        type: 'ADD_PATTERN',
        payload: { trackId: track.id, name: 'Chorus', lengthBeats: 8 },
      });
      expect(result.tracks[0]!.patterns).toHaveLength(2);
      expect(result.tracks[0]!.patterns[1]!.name).toBe('Chorus');
      expect(result.tracks[0]!.patterns[1]!.lengthBeats).toBe(8);
    });

    it('REMOVE_PATTERN removes a non-last pattern', () => {
      let state = createInitialState();
      const track = state.tracks[0]!;
      state = soundscapeReducer(state, {
        type: 'ADD_PATTERN',
        payload: { trackId: track.id, name: 'Extra', lengthBeats: 8 },
      });
      const patternToRemove = state.tracks[0]!.patterns[1]!;
      const result = soundscapeReducer(state, {
        type: 'REMOVE_PATTERN',
        payload: { trackId: track.id, patternId: patternToRemove.id },
      });
      expect(result.tracks[0]!.patterns).toHaveLength(1);
    });

    it('REMOVE_PATTERN is a no-op when only one pattern remains', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const result = soundscapeReducer(state, {
        type: 'REMOVE_PATTERN',
        payload: { trackId: track.id, patternId: track.patterns[0]!.id },
      });
      expect(result.tracks[0]!.patterns).toHaveLength(1);
    });

    it('RENAME_PATTERN updates pattern name', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const result = soundscapeReducer(state, {
        type: 'RENAME_PATTERN',
        payload: { trackId: track.id, patternId: track.patterns[0]!.id, name: 'Intro' },
      });
      expect(result.tracks[0]!.patterns[0]!.name).toBe('Intro');
    });

    it('ADD_CLIP adds a clip to the arrangement', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const result = soundscapeReducer(state, {
        type: 'ADD_CLIP',
        payload: { trackId: track.id, patternId: track.patterns[0]!.id, startBeat: 16 },
      });
      expect(result.tracks[0]!.arrangement).toHaveLength(2);
      expect(result.tracks[0]!.arrangement[1]!.startBeat).toBe(16);
    });

    it('REMOVE_CLIP removes a clip from the arrangement', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const clipId = track.arrangement[0]!.id;
      const result = soundscapeReducer(state, {
        type: 'REMOVE_CLIP',
        payload: { trackId: track.id, clipId },
      });
      expect(result.tracks[0]!.arrangement).toHaveLength(0);
    });

    it('MOVE_CLIP updates clip startBeat', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const clipId = track.arrangement[0]!.id;
      const result = soundscapeReducer(state, {
        type: 'MOVE_CLIP',
        payload: { trackId: track.id, clipId, startBeat: 8 },
      });
      expect(result.tracks[0]!.arrangement[0]!.startBeat).toBe(8);
    });
  });

  describe('note actions with patternId', () => {
    it('ADD_NOTE adds a note to the specified pattern', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const patternId = track.patterns[0]!.id;
      const result = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId: track.id, patternId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      });
      expect(result.tracks[0]!.patterns[0]!.notes).toHaveLength(1);
      expect(result.tracks[0]!.patterns[0]!.notes[0]!.pitch).toBe(60);
    });

    it('REMOVE_NOTE removes a note from the specified pattern', () => {
      const state = createInitialState();
      const track = state.tracks[0]!;
      const patternId = track.patterns[0]!.id;
      const withNote = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId: track.id, patternId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      });
      const noteId = withNote.tracks[0]!.patterns[0]!.notes[0]!.id;
      const result = soundscapeReducer(withNote, {
        type: 'REMOVE_NOTE',
        payload: { trackId: track.id, patternId, noteId },
      });
      expect(result.tracks[0]!.patterns[0]!.notes).toHaveLength(0);
    });
  });
})
