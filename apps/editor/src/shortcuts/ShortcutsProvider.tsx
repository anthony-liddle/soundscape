import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ShortcutsContext } from './context';
import type { ShortcutRegistry, ViewShortcuts } from './context';
import { handleShortcut } from './handleShortcut';

/**
 * Listens for the shortcuts every view shares and sends each to the view in
 * front: the view that became active most recently and is still active.
 * With one view, that view gets them all.
 */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  // In the order they came to the front; the last is in front
  const views = useRef<RefObject<ViewShortcuts>[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const front = views.current[views.current.length - 1];
      if (front) handleShortcut(e, front.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const registry = useMemo<ShortcutRegistry>(
    () => ({
      register(view) {
        views.current = [...views.current, view];
        return () => {
          views.current = views.current.filter((v) => v !== view);
        };
      },
    }),
    []
  );

  return <ShortcutsContext.Provider value={registry}>{children}</ShortcutsContext.Provider>;
}
