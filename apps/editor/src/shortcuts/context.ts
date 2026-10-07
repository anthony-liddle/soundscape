import { createContext } from 'react';
import type { RefObject } from 'react';

/**
 * What a view does for each shortcut every view shares. A view leaves out
 * any it has no use for, and that key then goes to the browser.
 */
export interface ViewShortcuts {
  /** Space */
  togglePlay?: (() => void) | undefined;
  /** Ctrl+Z or Cmd+Z */
  undo?: (() => void) | undefined;
  /** Ctrl+Shift+Z or Ctrl+Y, and the same with Cmd */
  redo?: (() => void) | undefined;
  /** Ctrl+S or Cmd+S */
  save?: (() => void) | undefined;
  /** Ctrl+D or Cmd+D */
  duplicate?: (() => void) | undefined;
}

export interface ShortcutRegistry {
  /** Puts a view in front. The function it returns takes the view out. */
  register: (view: RefObject<ViewShortcuts>) => () => void;
}

export const ShortcutsContext = createContext<ShortcutRegistry | null>(null);
