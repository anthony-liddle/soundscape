// How two renders of a song compare: window by window, as Peach of a Word's
// measure() reads each window, and as how far under the music their
// difference sits.
import { measure } from '../cues/measure/soundMeasure.ts';
import { spreadBetween, widest, NO_SPREAD, toleranceFrom } from '../cues/measure/renderSpread.ts';

/** Each window is 2 s, read from the frame the game starts the music on. */
export const WINDOW_SECONDS = 2;

/** The window starts of a render, from `from`, as many as fit whole. */
export function windowStarts(length, rate, from) {
  const size = Math.round(WINDOW_SECONDS * rate);
  const starts = [];
  for (let s = from; s + size <= length; s += size) starts.push(s);
  return starts;
}

/** measure() over each window, read as a cue called at the window's start; null for a silent one. */
export function measureWindows(samples, rate, from) {
  const size = Math.round(WINDOW_SECONDS * rate);
  return windowStarts(samples.length, rate, from).map((s) => {
    try {
      return measure(samples.subarray(s, s + size), rate);
    } catch {
      return null;
    }
  });
}

/**
 * For each window, how far under the music the difference between `a` and
 * `b` sits, in dB: the difference's energy over `a`'s. -Infinity where they
 * are identical; null where `a` is silent.
 */
export function underMusic(a, b, rate, from) {
  const size = Math.round(WINDOW_SECONDS * rate);
  return windowStarts(Math.min(a.length, b.length), rate, from).map((s) => {
    let music = 0;
    let diff = 0;
    for (let i = s; i < s + size; i++) {
      music += a[i] * a[i];
      const d = a[i] - b[i];
      diff += d * d;
    }
    if (music === 0) return null;
    return diff === 0 ? -Infinity : 10 * Math.log10(diff / music);
  });
}

/** The loudest window of underMusic: the worst. */
export const worst = (dbs) => Math.max(...dbs.filter((x) => x !== null));

/** The widest spread between two window grids, and how many windows are silent in one only. */
export function spreadOf(wa, wb) {
  let s = { ...NO_SPREAD };
  let silentInOne = 0;
  wa.forEach((m, i) => {
    const n = wb[i];
    if ((m === null) !== (n === null)) silentInOne++;
    else if (m && n) s = widest(s, spreadBetween(m, n));
  });
  return { ...s, silentInOne };
}

/** The tolerance Peach's fixture rule gives a spread: rounded up to its step, plus one. */
export { toleranceFrom };

/** Largest absolute difference, and where. */
export function largestGap(a, b, from = 0) {
  let max = 0;
  let at = -1;
  for (let i = from; i < Math.min(a.length, b.length); i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) {
      max = d;
      at = i;
    }
  }
  return { max, at };
}

/** RMS in dBFS from `from` on, or over [from, to). */
export function rmsDb(x, from = 0, to = x.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, to - from));
}

/** dB rounded to 0.1, keeping -Infinity and null readable in JSON. */
export const db1 = (x) => (x === null ? null : x === -Infinity ? '-inf' : Math.round(x * 10) / 10);
