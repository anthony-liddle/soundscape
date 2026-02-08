/**
 * Convert beats to seconds based on tempo (BPM)
 */
export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

/**
 * Convert seconds to beats based on tempo (BPM)
 */
export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

/**
 * Map normalized ADSR values (0-1) to seconds
 */
export function normalizedToADSR(normalized: number, type: 'attack' | 'decay' | 'release'): number {
  switch (type) {
    case 'attack':
      // 0.001s to 2s, exponential
      return 0.001 + normalized * normalized * 1.999;
    case 'decay':
      // 0.01s to 3s
      return 0.01 + normalized * normalized * 2.99;
    case 'release':
      // 0.01s to 5s
      return 0.01 + normalized * normalized * 4.99;
    default:
      return normalized;
  }
}

/**
 * Map normalized delay time (0-1) to seconds (0 - 1s)
 */
export function normalizedToDelayTime(normalized: number): number {
  return normalized;
}

/**
 * Format seconds as mm:ss.ms
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

/**
 * Format beats as bar.beat (assuming 4/4)
 */
export function formatBeats(beats: number, beatsPerBar: number = 4): string {
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = (beats % beatsPerBar) + 1;
  return `${bar}.${beat.toFixed(0)}`;
}
