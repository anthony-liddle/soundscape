import { describe, it, expect, beforeEach } from 'vitest'
import { resetMockUuid } from '../../test/setup'
import { soundscapeReducer, createInitialState } from '../reducer'
import { historyReducer, createInitialHistory } from '../history'

describe('batched note actions', () => {
  beforeEach(() => {
    resetMockUuid()
  })

  describe('ADD_NOTES', () => {
    it('adds all notes with generated ids to the target track only', () => {
      const state = createInitialState()
      const trackId = state.tracks[0]!.id
      const result = soundscapeReducer(state, {
        type: 'ADD_NOTES',
        payload: {
          trackId,
          notes: [
            { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
            { pitch: 64, startTime: 1, duration: 0.5, velocity: 90 },
          ],
        },
      })
      const notes = result.tracks[0]!.notes
      expect(notes).toHaveLength(2)
      expect(notes[0]!.pitch).toBe(60)
      expect(notes[1]!.pitch).toBe(64)
      expect(notes[0]!.id).toBeTruthy()
      expect(notes[0]!.id).not.toBe(notes[1]!.id)
    })

    it('is a no-op for an empty notes list', () => {
      const state = createInitialState()
      const trackId = state.tracks[0]!.id
      const result = soundscapeReducer(state, {
        type: 'ADD_NOTES',
        payload: { trackId, notes: [] },
      })
      expect(result).toBe(state)
    })
  })

  describe('REMOVE_NOTES', () => {
    it('removes exactly the given note ids', () => {
      let state = createInitialState()
      const trackId = state.tracks[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTES',
        payload: {
          trackId,
          notes: [
            { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
            { pitch: 62, startTime: 1, duration: 1, velocity: 100 },
            { pitch: 64, startTime: 2, duration: 1, velocity: 100 },
          ],
        },
      })
      const ids = state.tracks[0]!.notes.map((n) => n.id)
      const result = soundscapeReducer(state, {
        type: 'REMOVE_NOTES',
        payload: { trackId, noteIds: [ids[0]!, ids[2]!] },
      })
      expect(result.tracks[0]!.notes).toHaveLength(1)
      expect(result.tracks[0]!.notes[0]!.pitch).toBe(62)
    })

    it('is a no-op when no ids match', () => {
      const state = createInitialState()
      const trackId = state.tracks[0]!.id
      const result = soundscapeReducer(state, {
        type: 'REMOVE_NOTES',
        payload: { trackId, noteIds: ['nope'] },
      })
      expect(result).toBe(state)
    })
  })

  describe('SET_TRACK_NOTES', () => {
    it('replaces the track notes wholesale', () => {
      let state = createInitialState()
      const trackId = state.tracks[0]!.id
      state = soundscapeReducer(state, {
        type: 'ADD_NOTES',
        payload: { trackId, notes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 100 }] },
      })
      const result = soundscapeReducer(state, {
        type: 'SET_TRACK_NOTES',
        payload: {
          trackId,
          notes: [
            { pitch: 70, startTime: 4, duration: 2, velocity: 80 },
            { pitch: 72, startTime: 6, duration: 1, velocity: 80 },
          ],
        },
      })
      const notes = result.tracks[0]!.notes
      expect(notes).toHaveLength(2)
      expect(notes.map((n) => n.pitch)).toEqual([70, 72])
    })
  })

  describe('history integration', () => {
    it('a batched add is a single undo step', () => {
      let h = createInitialHistory()
      const trackId = h.present.tracks[0]!.id
      h = historyReducer(h, {
        type: 'ADD_NOTES',
        payload: {
          trackId,
          notes: [
            { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
            { pitch: 64, startTime: 1, duration: 1, velocity: 100 },
            { pitch: 67, startTime: 2, duration: 1, velocity: 100 },
          ],
        },
      })
      expect(h.past).toHaveLength(1)
      const undone = historyReducer(h, { type: 'UNDO' })
      expect(undone.present.tracks[0]!.notes).toHaveLength(0)
    })
  })
})
