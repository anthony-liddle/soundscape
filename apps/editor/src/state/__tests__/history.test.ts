import { describe, it, expect, beforeEach } from 'vitest'
import { resetMockUuid } from '../../test/setup'
import { historyReducer, createInitialHistory, MAX_HISTORY } from '../history'
import type { HistoryState, HistoryAction } from '../history'

function dispatchAll(state: HistoryState, actions: HistoryAction[]): HistoryState {
  return actions.reduce(historyReducer, state)
}

describe('history reducer', () => {
  beforeEach(() => {
    resetMockUuid()
  })

  describe('createInitialHistory', () => {
    it('starts with empty past and future around the initial state', () => {
      const h = createInitialHistory()
      expect(h.past).toEqual([])
      expect(h.future).toEqual([])
      expect(h.present.tracks).toHaveLength(1)
    })
  })

  describe('undoable actions', () => {
    it('pushes the previous present onto past', () => {
      const h0 = createInitialHistory()
      const h1 = historyReducer(h0, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      expect(h1.past).toHaveLength(1)
      expect(h1.past[0]).toBe(h0.present)
      expect(h1.present.tracks).toHaveLength(2)
      expect(h1.future).toEqual([])
    })

    it('does not record history for no-op actions', () => {
      const h0 = createInitialHistory()
      const h1 = historyReducer(h0, {
        type: 'REMOVE_TRACK',
        payload: { trackId: 'does-not-exist' },
      })
      expect(h1.past).toHaveLength(0)
      // present unchanged apart from track filtering producing a new array is
      // acceptable, but nothing should be undoable
    })

    it('caps past length at MAX_HISTORY, dropping oldest entries', () => {
      let h = createInitialHistory()
      for (let i = 0; i < MAX_HISTORY + 5; i++) {
        h = historyReducer(h, {
          type: 'ADD_TRACK',
          payload: { name: `Track ${i}`, presetId: 'lead' },
        })
      }
      expect(h.past).toHaveLength(MAX_HISTORY)
      // The oldest surviving entry is 5 additions in, not the initial state
      expect(h.past[0]!.tracks.length).toBeGreaterThan(1)
    })
  })

  describe('UNDO / REDO', () => {
    it('UNDO restores the previous present and enables redo', () => {
      const h0 = createInitialHistory()
      const h1 = historyReducer(h0, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      const h2 = historyReducer(h1, { type: 'UNDO' })
      expect(h2.present).toBe(h0.present)
      expect(h2.past).toHaveLength(0)
      expect(h2.future).toHaveLength(1)
      expect(h2.future[0]).toBe(h1.present)
    })

    it('REDO restores the undone state', () => {
      const h0 = createInitialHistory()
      const h1 = historyReducer(h0, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      const h2 = dispatchAll(h1, [{ type: 'UNDO' }, { type: 'REDO' }])
      expect(h2.present).toBe(h1.present)
      expect(h2.past).toHaveLength(1)
      expect(h2.future).toHaveLength(0)
    })

    it('UNDO with empty past is a no-op', () => {
      const h0 = createInitialHistory()
      expect(historyReducer(h0, { type: 'UNDO' })).toBe(h0)
    })

    it('REDO with empty future is a no-op', () => {
      const h0 = createInitialHistory()
      expect(historyReducer(h0, { type: 'REDO' })).toBe(h0)
    })

    it('a new action after UNDO clears the future', () => {
      const h0 = createInitialHistory()
      const h1 = historyReducer(h0, {
        type: 'ADD_TRACK',
        payload: { name: 'Track 2', presetId: 'bass' },
      })
      const h2 = historyReducer(h1, { type: 'UNDO' })
      const h3 = historyReducer(h2, {
        type: 'SET_METADATA',
        payload: { name: 'Renamed' },
      })
      expect(h3.future).toEqual([])
    })
  })

  describe('coalescing of continuous gestures', () => {
    it('merges consecutive master volume changes into one history entry', () => {
      const h0 = createInitialHistory()
      const h = dispatchAll(h0, [
        { type: 'SET_MASTER_VOLUME', payload: 0.7 },
        { type: 'SET_MASTER_VOLUME', payload: 0.6 },
        { type: 'SET_MASTER_VOLUME', payload: 0.5 },
      ])
      expect(h.present.mixer.masterVolume).toBe(0.5)
      expect(h.past).toHaveLength(1)
      // A single undo restores the pre-drag value
      const undone = historyReducer(h, { type: 'UNDO' })
      expect(undone.present.mixer.masterVolume).toBe(0.8)
    })

    it('does not merge across different action types', () => {
      const h0 = createInitialHistory()
      const h = dispatchAll(h0, [
        { type: 'SET_MASTER_VOLUME', payload: 0.7 },
        { type: 'ADD_TRACK', payload: { name: 'Track 2', presetId: 'lead' } },
        { type: 'SET_MASTER_VOLUME', payload: 0.6 },
      ])
      expect(h.past).toHaveLength(3)
    })

    it('does not merge metadata changes to different fields', () => {
      const h0 = createInitialHistory()
      const h = dispatchAll(h0, [
        { type: 'SET_METADATA', payload: { name: 'A' } },
        { type: 'SET_METADATA', payload: { tempo: 140 } },
      ])
      expect(h.past).toHaveLength(2)
    })

    it('merges consecutive keystrokes on the same metadata field', () => {
      const h0 = createInitialHistory()
      const h = dispatchAll(h0, [
        { type: 'SET_METADATA', payload: { name: 'A' } },
        { type: 'SET_METADATA', payload: { name: 'AB' } },
        { type: 'SET_METADATA', payload: { name: 'ABC' } },
      ])
      expect(h.past).toHaveLength(1)
      const undone = historyReducer(h, { type: 'UNDO' })
      expect(undone.present.metadata.name).toBe('Untitled Soundscape')
    })

    it('merges consecutive param override changes to the same track and param', () => {
      const h0 = createInitialHistory()
      const trackId = h0.present.tracks[0]!.id
      const h = dispatchAll(h0, [
        { type: 'SET_TRACK_PARAM_OVERRIDES', payload: { trackId, overrides: { filterCutoff: 0.5 } } },
        { type: 'SET_TRACK_PARAM_OVERRIDES', payload: { trackId, overrides: { filterCutoff: 0.4 } } },
      ])
      expect(h.past).toHaveLength(1)
    })

    it('does not merge param override changes to different params', () => {
      const h0 = createInitialHistory()
      const trackId = h0.present.tracks[0]!.id
      const h = dispatchAll(h0, [
        { type: 'SET_TRACK_PARAM_OVERRIDES', payload: { trackId, overrides: { filterCutoff: 0.5 } } },
        { type: 'SET_TRACK_PARAM_OVERRIDES', payload: { trackId, overrides: { attack: 0.2 } } },
      ])
      expect(h.past).toHaveLength(2)
    })

    it('UNDO breaks a coalescing run', () => {
      const h0 = createInitialHistory()
      const h1 = dispatchAll(h0, [
        { type: 'SET_MASTER_VOLUME', payload: 0.7 },
        { type: 'UNDO' },
        { type: 'SET_MASTER_VOLUME', payload: 0.6 },
      ])
      // The change after UNDO is its own entry, undoable on its own
      expect(h1.past).toHaveLength(1)
      const undone = historyReducer(h1, { type: 'UNDO' })
      expect(undone.present.mixer.masterVolume).toBe(0.8)
    })
  })
})
