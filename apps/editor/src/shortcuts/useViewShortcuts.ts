import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { ShortcutsContext } from './context';
import type { ViewShortcuts } from './context';

/**
 * Gives a view the shared shortcuts while it is active. A view that becomes
 * active goes in front of the others; one that stops being active, or
 * unmounts, hands them back to the view behind it.
 *
 * The actions can change on every render without moving the view: only
 * `active` decides its place.
 */
export function useViewShortcuts(shortcuts: ViewShortcuts, active = true): void {
  const registry = useContext(ShortcutsContext);
  if (!registry) {
    throw new Error('useViewShortcuts must be used within a ShortcutsProvider');
  }

  const latest = useRef(shortcuts);
  useLayoutEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    if (!active) return;
    return registry.register(latest);
  }, [registry, active]);
}
