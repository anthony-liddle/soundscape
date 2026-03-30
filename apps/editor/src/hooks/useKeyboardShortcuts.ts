import { useEffect, useCallback } from 'react';
import type { Dispatch } from 'react';
import type { SoundscapeState } from 'soundscape-engine';
import type { SoundscapeAction } from '../state/reducer';
import { exportSoundscape } from '../utils/exportSoundscape';

interface KeyboardShortcutOptions {
  isPlaying: boolean;
  play: () => void;
  stop: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  state: SoundscapeState;
  selectedTrackId: string | null;
  dispatch: Dispatch<SoundscapeAction>;
}

export function useKeyboardShortcuts({
  isPlaying,
  play,
  stop,
  undo,
  redo,
  canUndo,
  canRedo,
  state,
  selectedTrackId,
  dispatch,
}: KeyboardShortcutOptions) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) { stop(); } else { play(); }
        return;
      }

      if (mod && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      if (mod && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      if (mod && e.code === 'KeyS') {
        e.preventDefault();
        exportSoundscape(state);
        return;
      }

      if (mod && e.code === 'KeyD' && selectedTrackId) {
        e.preventDefault();
        dispatch({ type: 'DUPLICATE_TRACK', payload: { trackId: selectedTrackId } });
        return;
      }
    },
    [isPlaying, play, stop, undo, redo, canUndo, canRedo, state, selectedTrackId, dispatch]
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
