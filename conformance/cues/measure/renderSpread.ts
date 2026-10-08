import type { Measurement } from './soundMeasure.ts';
import type { Partial } from './spectrum.ts';

/**
 * How far the measurements of one sound move between renders that should be
 * identical. Chrome's offline renders differ by up to 6e-8 from run to run, so
 * a comparison against the baseline has to allow at least this much before it
 * calls anything a change.
 */

/** Two partials in different renders are the same one if this close, as a fraction. */
export const PARTIAL_MATCH = 0.005;

/** Each kind of value is recorded to this step, so rounding alone can move it by one. */
export const STEP = { seconds: 1e-5, db: 0.01, hz: 0.01 } as const;

export interface Spread {
  /** Largest difference in onset, end, duration or stop. */
  seconds: number;
  /** Largest difference in peak, RMS or an envelope point. */
  db: number;
  /** Largest difference in the fundamental. */
  hz: number;
  /** Largest difference in a window's strongest partial, in dBFS. */
  windowDbfs: number;
  /** Largest difference in a matched partial's frequency. */
  partialHz: number;
  /** Largest difference in a matched partial's relative level. */
  partialDb: number;
  /** Partials present in one render and not the other, or a window null in one. */
  membershipChanges: number;
  /** Windows whose strongest partial is a different one. */
  strongestChanges: number;
}

export const NO_SPREAD: Spread = {
  seconds: 0,
  db: 0,
  hz: 0,
  windowDbfs: 0,
  partialHz: 0,
  partialDb: 0,
  membershipChanges: 0,
  strongestChanges: 0,
};

const gap = (a: number | null, b: number | null): number =>
  a === null || b === null ? 0 : Math.abs(a - b);

const sameNull = (a: unknown, b: unknown): boolean =>
  (a === null) === (b === null);

function matchPartial(p: Partial, among: Partial[]): Partial | undefined {
  return among.find((q) => Math.abs(q.hz - p.hz) <= PARTIAL_MATCH * p.hz);
}

/** The spread between two measurements of the same sound. */
export function spreadBetween(a: Measurement, b: Measurement): Spread {
  const s = { ...NO_SPREAD };
  s.seconds = Math.max(
    gap(a.onset, b.onset),
    gap(a.end, b.end),
    gap(a.duration, b.duration),
    gap(a.stop, b.stop),
  );
  s.db = Math.max(
    gap(a.peakDbfs, b.peakDbfs),
    gap(a.rmsDbfs, b.rmsDbfs),
    ...a.envelopeDbfs.map((v, i) => gap(v, b.envelopeDbfs[i] ?? null)),
  );
  if (!a.envelopeDbfs.every((v, i) => sameNull(v, b.envelopeDbfs[i])))
    s.membershipChanges += 1;
  s.hz = gap(a.fundamentalHz, b.fundamentalHz);
  if ((a.pair === undefined) !== (b.pair === undefined))
    s.membershipChanges += 1;
  if (a.pair && b.pair)
    a.pair.notes.forEach((n, i) => {
      s.hz = Math.max(s.hz, Math.abs(n.hz - b.pair!.notes[i]!.hz));
      s.db = Math.max(s.db, Math.abs(n.db - b.pair!.notes[i]!.db));
    });

  a.spectrum.forEach((wa, i) => {
    const wb = b.spectrum[i]!;
    if (!sameNull(wa.dbfs, wb.dbfs)) s.membershipChanges += 1;
    s.windowDbfs = Math.max(s.windowDbfs, gap(wa.dbfs, wb.dbfs));
    const [sa, sb] = [wa.partials[0], wb.partials[0]];
    if (sa && sb && !matchPartial(sa, [sb])) s.strongestChanges += 1;
    for (const p of wa.partials) {
      const q = matchPartial(p, wb.partials);
      if (!q) {
        s.membershipChanges += 1;
        continue;
      }
      s.partialHz = Math.max(s.partialHz, Math.abs(p.hz - q.hz));
      s.partialDb = Math.max(s.partialDb, Math.abs(p.db - q.db));
    }
    for (const q of wb.partials)
      if (!matchPartial(q, wa.partials)) s.membershipChanges += 1;
  });
  return s;
}

/** The larger of two spreads, field by field. */
export function widest(a: Spread, b: Spread): Spread {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof Spread)[])
    out[k] = Math.max(a[k], b[k]);
  return out;
}

/** Round `value` up to a whole number of steps, then add one more step. */
const allow = (value: number, step: number): number =>
  Math.round((Math.ceil(value / step - 1e-9) + 1) * step * 1e6) / 1e6;

/**
 * The tolerance a comparison needs for each kind of value: the widest spread
 * seen between repeated renders, rounded up to the recording step, plus one
 * step, because two values rounded independently can land a step apart even
 * when nothing changed.
 */
export function toleranceFrom(s: Spread) {
  return {
    seconds: allow(s.seconds, STEP.seconds),
    db: allow(Math.max(s.db, s.windowDbfs), STEP.db),
    hz: allow(s.hz, STEP.hz),
    partialHz: allow(s.partialHz, STEP.hz),
    partialDb: allow(s.partialDb, STEP.db),
  };
}
