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

/**
 * The bar's first rule, window by window: the difference at least 80 dB
 * under the music, or, where the music itself has died away, under 2^-24 of
 * full scale, the step of a float32 sample at full scale, which the engine
 * already counts as rung out.
 */
export const RULE = { underMusicDb: -80, floorDbfs: 20 * Math.log10(2 ** -24) };

/** For each window, the difference's own level in dBFS: -Infinity where there is none. */
export function differenceDbfs(a, b, rate, from) {
  const size = Math.round(WINDOW_SECONDS * rate);
  return windowStarts(Math.min(a.length, b.length), rate, from).map((s) => {
    let diff = 0;
    for (let i = s; i < s + size; i++) {
      const d = a[i] - b[i];
      diff += d * d;
    }
    return diff === 0 ? -Infinity : 10 * Math.log10(diff / size);
  });
}

/** Each window of `b` against `a`, by the first rule, and whether every window meets it. */
export function meetsRule(a, b, rate, from) {
  const under = underMusic(a, b, rate, from);
  const level = differenceDbfs(a, b, rate, from);
  const windows = under.map((u, i) => ({
    under: u,
    level: level[i],
    pass: level[i] <= RULE.floorDbfs || (u !== null && u <= RULE.underMusicDb),
  }));
  return { windows, pass: windows.every((w) => w.pass) };
}

/** A spread within a tolerance: every measure, no partial gained, lost or made strongest, no window silent in one only. */
export function withinTolerance(spread, tolerance) {
  // Every measure is recorded to a step, so a spread is a whole number of
  // steps, give or take a double's rounding
  const within = (x, t) => x <= t + 1e-9;
  return (
    within(spread.seconds, tolerance.seconds) &&
    within(Math.max(spread.db, spread.windowDbfs), tolerance.db) &&
    within(spread.hz, tolerance.hz) &&
    within(spread.partialHz, tolerance.partialHz) &&
    within(spread.partialDb, tolerance.partialDb) &&
    spread.membershipChanges === 0 &&
    spread.strongestChanges === 0 &&
    spread.silentInOne === 0
  );
}

/** The widest of two spreads, field by field. */
export function wider(a, b) {
  return Object.fromEntries(Object.keys(a).map((k) => [k, Math.max(a[k], b[k])]));
}
