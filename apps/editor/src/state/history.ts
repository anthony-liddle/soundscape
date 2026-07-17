import type { SoundscapeState } from 'soundscape-engine';
import { soundscapeReducer, createInitialState } from './reducer';
import type { SoundscapeAction } from './reducer';

export const MAX_HISTORY = 50;

export interface HistoryState {
  past: SoundscapeState[];
  present: SoundscapeState;
  future: SoundscapeState[];
  /** Coalescing key of the last applied action, or null if none/broken. */
  lastCoalesceKey: string | null;
}

export type HistoryAction = SoundscapeAction | { type: 'UNDO' } | { type: 'REDO' };

export function createInitialHistory(): HistoryState {
  return {
    past: [],
    present: createInitialState(),
    future: [],
    lastCoalesceKey: null,
  };
}

/**
 * Continuous gestures (slider drags, typing) dispatch many actions per second.
 * Consecutive actions sharing a coalesce key collapse into a single history
 * entry so one undo reverts the whole gesture. Returns null for discrete
 * actions, which always get their own entry.
 */
function coalesceKey(action: SoundscapeAction): string | null {
  switch (action.type) {
    case 'SET_MASTER_VOLUME':
      return 'SET_MASTER_VOLUME';
    case 'SET_MIXER_TRACK':
      return `SET_MIXER_TRACK:${action.payload.trackId}:${Object.keys(action.payload.state).sort().join(',')}`;
    case 'SET_TRACK_PARAM_OVERRIDES':
      return `SET_TRACK_PARAM_OVERRIDES:${action.payload.trackId}:${Object.keys(action.payload.overrides).sort().join(',')}`;
    case 'SET_METADATA':
      return `SET_METADATA:${Object.keys(action.payload).sort().join(',')}`;
    default:
      return null;
  }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'UNDO': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastCoalesceKey: null,
      };
    }

    case 'REDO': {
      const [next, ...remaining] = state.future;
      if (!next) return state;
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: next,
        future: remaining,
        lastCoalesceKey: null,
      };
    }

    default: {
      const newPresent = soundscapeReducer(state.present, action);
      if (newPresent === state.present) return state;

      const key = coalesceKey(action);
      if (key !== null && key === state.lastCoalesceKey) {
        // Continue the gesture: replace present without a new history entry
        return { ...state, present: newPresent };
      }

      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: newPresent,
        future: [],
        lastCoalesceKey: key,
      };
    }
  }
}
