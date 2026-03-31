import { describe, it, expect, beforeEach } from 'vitest'
import { resetMockUuid } from '../../test/setup'
import { soundscapeReducer, createInitialState } from '../reducer'
import type { SoundscapeState, InstrumentPreset } from 'soundscape-engine'

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
    it('adds a note to a pattern track', () => {
      const initialState = createInitialState()
      const patternId = initialState.patterns[0]!.id
      const trackId = initialState.tracks[0]!.id
      const result = soundscapeReducer(initialState, {
        type: 'ADD_NOTE',
        payload: { patternId, trackId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      })
      expect(result.patterns[0]!.trackNotes[trackId]).toHaveLength(1)
      expect(result.patterns[0]!.trackNotes[trackId]![0]!.pitch).toBe(60)
    })

    it('uses default duration and velocity', () => {
      const initialState = createInitialState()
      const patternId = initialState.patterns[0]!.id
      const trackId = initialState.tracks[0]!.id
      const result = soundscapeReducer(initialState, {
        type: 'ADD_NOTE',
        payload: { patternId, trackId, pitch: 60, startTime: 0 },
      })
      expect(result.patterns[0]!.trackNotes[trackId]![0]!.duration).toBe(1)
      expect(result.patterns[0]!.trackNotes[trackId]![0]!.velocity).toBe(100)
    })
  })

  describe('REMOVE_NOTE', () => {
    it('removes a note from a pattern track', () => {
      let state = createInitialState()
      const patternId = state.patterns[0]!.id
      const trackId = state.tracks[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { patternId, trackId, pitch: 60, startTime: 0 },
      })
      const noteId = state.patterns[0]!.trackNotes[trackId]![0]!.id

      const result = soundscapeReducer(state, {
        type: 'REMOVE_NOTE',
        payload: { patternId, trackId, noteId },
      })
      expect(result.patterns[0]!.trackNotes[trackId]).toHaveLength(0)
    })
  })

  describe('UPDATE_NOTE', () => {
    it('updates note properties', () => {
      let state = createInitialState()
      const patternId = state.patterns[0]!.id
      const trackId = state.tracks[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { patternId, trackId, pitch: 60, startTime: 0 },
      })
      const noteId = state.patterns[0]!.trackNotes[trackId]![0]!.id

      const result = soundscapeReducer(state, {
        type: 'UPDATE_NOTE',
        payload: { patternId, trackId, noteId, updates: { pitch: 72, duration: 2 } },
      })
      expect(result.patterns[0]!.trackNotes[trackId]![0]!.pitch).toBe(72)
      expect(result.patterns[0]!.trackNotes[trackId]![0]!.duration).toBe(2)
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

  describe('ADD_PRESET', () => {
    it('adds a custom preset to state', () => {
      const state = createInitialState()
      const newPreset: InstrumentPreset = {
        id: 'preset-1',
        name: 'My Preset',
        params: state.presets[0]!.params,
        isBuiltIn: false,
      }
      const result = soundscapeReducer(state, { type: 'ADD_PRESET', payload: newPreset })
      expect(result.presets).toContainEqual(newPreset)
      expect(result.presets.length).toBe(state.presets.length + 1)
    })
  })

  describe('REMOVE_PRESET', () => {
    it('removes a custom preset by id', () => {
      const customPreset: InstrumentPreset = {
        id: 'custom-1',
        name: 'Custom',
        params: createInitialState().presets[0]!.params,
        isBuiltIn: false,
      }
      const state = soundscapeReducer(createInitialState(), { type: 'ADD_PRESET', payload: customPreset })
      const result = soundscapeReducer(state, { type: 'REMOVE_PRESET', payload: { presetId: 'custom-1' } })
      expect(result.presets.find((p) => p.id === 'custom-1')).toBeUndefined()
    })

    it('does not remove a built-in preset', () => {
      const state = createInitialState()
      const builtInId = state.presets[0]!.id
      const result = soundscapeReducer(state, { type: 'REMOVE_PRESET', payload: { presetId: builtInId } })
      expect(result.presets).toEqual(state.presets)
    })
  })

  describe('UPDATE_PRESET', () => {
    it('updates a custom preset name', () => {
      const customPreset: InstrumentPreset = {
        id: 'custom-1',
        name: 'Old Name',
        params: createInitialState().presets[0]!.params,
        isBuiltIn: false,
      }
      const state = soundscapeReducer(createInitialState(), { type: 'ADD_PRESET', payload: customPreset })
      const result = soundscapeReducer(state, {
        type: 'UPDATE_PRESET',
        payload: { presetId: 'custom-1', updates: { name: 'New Name' } },
      })
      expect(result.presets.find((p) => p.id === 'custom-1')?.name).toBe('New Name')
    })

    it('does not update a built-in preset', () => {
      const state = createInitialState()
      const builtInPreset = state.presets[0]!
      const result = soundscapeReducer(state, {
        type: 'UPDATE_PRESET',
        payload: { presetId: builtInPreset.id, updates: { name: 'Hacked' } },
      })
      expect(result.presets.find((p) => p.id === builtInPreset.id)?.name).toBe(builtInPreset.name)
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
})

describe('createInitialState', () => {
  it('creates a state with one pattern and one arrangement clip', () => {
    const state = createInitialState()
    expect(state.patterns).toHaveLength(1)
    expect(state.patterns[0]!.name).toBe('Pattern 1')
    expect(state.arrangement).toHaveLength(1)
    expect(state.arrangement[0]!.patternId).toBe(state.patterns[0]!.id)
  })
})

describe('pattern actions', () => {
  it('ADD_PATTERN adds a global pattern', () => {
    const state = createInitialState()
    const result = soundscapeReducer(state, {
      type: 'ADD_PATTERN',
      payload: { name: 'Chorus', lengthBeats: 8 },
    })
    expect(result.patterns).toHaveLength(2)
    expect(result.patterns[1]!.name).toBe('Chorus')
    expect(result.patterns[1]!.lengthBeats).toBe(8)
    expect(result.patterns[1]!.trackNotes).toEqual({})
  })

  it('REMOVE_PATTERN removes the pattern and its clips', () => {
    let state = createInitialState()
    state = soundscapeReducer(state, { type: 'ADD_PATTERN', payload: { name: 'Chorus', lengthBeats: 8 } })
    const patternId = state.patterns[1]!.id
    state = soundscapeReducer(state, { type: 'ADD_CLIP', payload: { patternId, startBeat: 16 } })
    const result = soundscapeReducer(state, { type: 'REMOVE_PATTERN', payload: { patternId } })
    expect(result.patterns.find((p) => p.id === patternId)).toBeUndefined()
    expect(result.arrangement.every((c) => c.patternId !== patternId)).toBe(true)
  })

  it('REMOVE_PATTERN is no-op when only one pattern remains', () => {
    const state = createInitialState()
    const result = soundscapeReducer(state, {
      type: 'REMOVE_PATTERN',
      payload: { patternId: state.patterns[0]!.id },
    })
    expect(result.patterns).toHaveLength(1)
  })

  it('RENAME_PATTERN updates name', () => {
    const state = createInitialState()
    const result = soundscapeReducer(state, {
      type: 'RENAME_PATTERN',
      payload: { patternId: state.patterns[0]!.id, name: 'Verse' },
    })
    expect(result.patterns[0]!.name).toBe('Verse')
  })

  it('DUPLICATE_PATTERN copies notes and creates new ids', () => {
    let state = createInitialState()
    const patternId = state.patterns[0]!.id
    state = soundscapeReducer(state, {
      type: 'ADD_NOTE',
      payload: { patternId, trackId: state.tracks[0]!.id, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    })
    const result = soundscapeReducer(state, { type: 'DUPLICATE_PATTERN', payload: { patternId } })
    expect(result.patterns).toHaveLength(2)
    const copy = result.patterns[1]!
    expect(copy.name).toBe('Pattern 1 (copy)')
    expect(copy.id).not.toBe(patternId)
    const originalNotes = result.patterns[0]!.trackNotes[state.tracks[0]!.id]!
    const copyNotes = copy.trackNotes[state.tracks[0]!.id]!
    expect(copyNotes).toHaveLength(originalNotes.length)
    expect(copyNotes[0]!.id).not.toBe(originalNotes[0]!.id)
  })

  it('COPY_TRACK_TO_PATTERN copies notes from source to target pattern', () => {
    let state = createInitialState()
    const sourcePatternId = state.patterns[0]!.id
    const trackId = state.tracks[0]!.id
    state = soundscapeReducer(state, {
      type: 'ADD_NOTE',
      payload: { patternId: sourcePatternId, trackId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    })
    state = soundscapeReducer(state, { type: 'ADD_PATTERN', payload: { name: 'Chorus', lengthBeats: 16 } })
    const targetPatternId = state.patterns[1]!.id
    const result = soundscapeReducer(state, {
      type: 'COPY_TRACK_TO_PATTERN',
      payload: { sourcePatternId, targetPatternId, trackId },
    })
    expect(result.patterns[1]!.trackNotes[trackId]).toHaveLength(1)
    expect(result.patterns[1]!.trackNotes[trackId]![0]!.pitch).toBe(60)
    expect(result.patterns[1]!.trackNotes[trackId]![0]!.id).not.toBe(
      result.patterns[0]!.trackNotes[trackId]![0]!.id
    )
  })
})

describe('arrangement actions', () => {
  it('ADD_CLIP adds a clip to the arrangement', () => {
    const state = createInitialState()
    const result = soundscapeReducer(state, {
      type: 'ADD_CLIP',
      payload: { patternId: state.patterns[0]!.id, startBeat: 16 },
    })
    expect(result.arrangement).toHaveLength(2)
    expect(result.arrangement[1]!.startBeat).toBe(16)
  })

  it('REMOVE_CLIP removes a clip', () => {
    const state = createInitialState()
    const clipId = state.arrangement[0]!.id
    const result = soundscapeReducer(state, { type: 'REMOVE_CLIP', payload: { clipId } })
    expect(result.arrangement).toHaveLength(0)
  })

  it('MOVE_CLIP updates startBeat', () => {
    const state = createInitialState()
    const clipId = state.arrangement[0]!.id
    const result = soundscapeReducer(state, { type: 'MOVE_CLIP', payload: { clipId, startBeat: 8 } })
    expect(result.arrangement[0]!.startBeat).toBe(8)
  })

  it('ADD_CLIP is a no-op when a clip already occupies that startBeat', () => {
    const state = createInitialState()
    // initial clip is at startBeat 0
    const result = soundscapeReducer(state, {
      type: 'ADD_CLIP',
      payload: { patternId: state.patterns[0]!.id, startBeat: 0 },
    })
    expect(result.arrangement).toHaveLength(1)
  })
})

describe('note actions with patternId + trackId', () => {
  it('ADD_NOTE adds a note to the correct pattern and track', () => {
    const state = createInitialState()
    const patternId = state.patterns[0]!.id
    const trackId = state.tracks[0]!.id
    const result = soundscapeReducer(state, {
      type: 'ADD_NOTE',
      payload: { patternId, trackId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    })
    expect(result.patterns[0]!.trackNotes[trackId]).toHaveLength(1)
    expect(result.patterns[0]!.trackNotes[trackId]![0]!.pitch).toBe(60)
  })

  it('REMOVE_NOTE removes the correct note', () => {
    let state = createInitialState()
    const patternId = state.patterns[0]!.id
    const trackId = state.tracks[0]!.id
    state = soundscapeReducer(state, {
      type: 'ADD_NOTE',
      payload: { patternId, trackId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    })
    const noteId = state.patterns[0]!.trackNotes[trackId]![0]!.id
    const result = soundscapeReducer(state, {
      type: 'REMOVE_NOTE',
      payload: { patternId, trackId, noteId },
    })
    expect(result.patterns[0]!.trackNotes[trackId]).toHaveLength(0)
  })
})
