import type { Dispatch } from 'react';
import type { SoundscapeState } from 'soundscape-engine';
import type { SoundscapeAction } from '../state/reducer';
import { exportSoundscape } from '../utils/exportSoundscape';
import { useViewShortcuts } from '../shortcuts';

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
  /** Whether the song view is in front. */
  active?: boolean;
}

/** The song view's shortcuts. They act on the song only while it is in front. */
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
  active = true,
}: KeyboardShortcutOptions) {
  useViewShortcuts({
    togglePlay: () => (isPlaying ? stop() : play()),
    undo: () => {
      if (canUndo) undo();
    },
    redo: () => {
      if (canRedo) redo();
    },
    save: () => exportSoundscape(state),
    // With no track selected, Ctrl+D is left to the browser
    duplicate: selectedTrackId
      ? () => dispatch({ type: 'DUPLICATE_TRACK', payload: { trackId: selectedTrackId } })
      : undefined,
  }, active);
}
