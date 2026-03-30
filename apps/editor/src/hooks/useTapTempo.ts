import { useCallback, useRef } from 'react';

const MAX_TAPS = 8;
const IDLE_TIMEOUT_MS = 2000;

/** Returns a `tap()` function. Call it on each button press to compute BPM. */
export function useTapTempo(onBpm: (bpm: number) => void): () => void {
  const tapsRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tap = useCallback(() => {
    const now = performance.now();

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    tapsRef.current = [...tapsRef.current.slice(-(MAX_TAPS - 1)), now];

    if (tapsRef.current.length >= 2) {
      const intervals = tapsRef.current
        .slice(1)
        .map((t, i) => t - tapsRef.current[i]!);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      onBpm(Math.max(40, Math.min(200, bpm)));
    }

    timerRef.current = setTimeout(() => {
      tapsRef.current = [];
    }, IDLE_TIMEOUT_MS);
  }, [onBpm]);

  return tap;
}
