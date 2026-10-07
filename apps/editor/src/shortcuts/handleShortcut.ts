import type { ViewShortcuts } from './context';
import { keepsEveryKey, keepsSpace } from './focus';

/** Runs the view's action for this key, if it has one. Keys are physical, by code. */
export function handleShortcut(e: KeyboardEvent, view: ViewShortcuts): void {
  // Whatever handled the key first, or a field that keeps it, has it
  if (e.defaultPrevented || keepsEveryKey(e.target)) return;

  const run = (action: (() => void) | undefined) => {
    if (!action) return;
    e.preventDefault();
    action();
  };

  if (e.code === 'Space') {
    // A focused button, checkbox or other control takes its own Space
    if (!keepsSpace(e.target)) run(view.togglePlay);
    return;
  }

  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.code === 'KeyZ' && !e.shiftKey) run(view.undo);
  else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) run(view.redo);
  else if (e.code === 'KeyS') run(view.save);
  else if (e.code === 'KeyD') run(view.duplicate);
}
