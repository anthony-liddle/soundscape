import { describe, it, expect, beforeEach } from 'vitest'
import { resetMockUuid } from '../../test/setup'
import { soundscapeReducer, createInitialState } from '../reducer'
import type { SoundscapeState } from '../../types'

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

  describe('ADD_NOTE', () => {
    it('adds a note to a track', () => {
      const initialState = createInitialState()
      const trackId = initialState.tracks[0].id
      const result = soundscapeReducer(initialState, {
        type: 'ADD_NOTE',
        payload: { trackId, pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      })
      expect(result.tracks[0].notes).toHaveLength(1)
      expect(result.tracks[0].notes[0].pitch).toBe(60)
    })

    it('uses default duration and velocity', () => {
      const initialState = createInitialState()
      const trackId = initialState.tracks[0].id
      const result = soundscapeReducer(initialState, {
        type: 'ADD_NOTE',
        payload: { trackId, pitch: 60, startTime: 0 },
      })
      expect(result.tracks[0].notes[0].duration).toBe(1)
      expect(result.tracks[0].notes[0].velocity).toBe(100)
    })
  })

  describe('REMOVE_NOTE', () => {
    it('removes a note from a track', () => {
      let state = createInitialState()
      const trackId = state.tracks[0].id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId, pitch: 60, startTime: 0 },
      })
      const noteId = state.tracks[0].notes[0].id

      const result = soundscapeReducer(state, {
        type: 'REMOVE_NOTE',
        payload: { trackId, noteId },
      })
      expect(result.tracks[0].notes).toHaveLength(0)
    })
  })

  describe('UPDATE_NOTE', () => {
    it('updates note properties', () => {
      let state = createInitialState()
      const trackId = state.tracks[0].id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTE',
        payload: { trackId, pitch: 60, startTime: 0 },
      })
      const noteId = state.tracks[0].notes[0].id

      const result = soundscapeReducer(state, {
        type: 'UPDATE_NOTE',
        payload: { trackId, noteId, updates: { pitch: 72, duration: 2 } },
      })
      expect(result.tracks[0].notes[0].pitch).toBe(72)
      expect(result.tracks[0].notes[0].duration).toBe(2)
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
})
