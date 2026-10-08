/**
 * The strongest partials in a short stretch of a rendered sound: what the rung
 * sparkle and the mythic glints are made of, which the summary measurements
 * cannot see because they sit 15 to 30 dB under the note.
 */

/** Each window is this long, centred on its time. */
export const PARTIAL_WINDOW_S = 0.04;

/** Partials more than this far under the window's strongest are not recorded. */
export const PARTIAL_FLOOR_DB = -60;

/**
 * And none under this, whatever the window's strongest. Renders of one sound
 * differ by up to 6e-8, about -144 dBFS, so a partial this close to that would
 * come and go between runs of the same render.
 */
export const PARTIAL_ABSOLUTE_FLOOR_DBFS = -120;

/** At most this many partials are recorded per window, strongest first. */
export const MAX_PARTIALS = 8;

/** The transform is zero-padded to this many points, about 1.5 Hz per bin at 48 kHz. */
const FFT_SIZE = 32768;

/**
 * Blackman-Harris, four terms. Its sidelobes sit near -92 dB, well under the
 * -60 dB floor, so no sidelobe of a loud note can be recorded as a partial of
 * its own. The price is a wide main lobe, about 100 Hz either side at 40 ms,
 * which still resolves the Edition chord's notes, 125 Hz apart.
 */
const BH = [0.35875, 0.48829, 0.14128, 0.01168] as const;

export interface Partial {
  /** Frequency in hertz. */
  hz: number;
  /** Level in dB relative to the strongest partial in the same window. */
  db: number;
}

export interface PartialWindow {
  /** Centre of the window, in seconds after the cue is called. */
  t: number;
  /** Amplitude of the window's strongest partial, in dBFS. null if silent or under the absolute floor. */
  dbfs: number | null;
  partials: Partial[];
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = wr * re[b]! - wi * im[b]!;
        const ti = wr * im[b]! + wi * re[b]!;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

/**
 * The strongest partials of `x` in the window centred on `t` seconds.
 *
 * Each local maximum of the windowed, zero-padded spectrum is a partial. Its
 * frequency and level come from a parabola through the peak bin and its two
 * neighbours, in dB. Levels are relative to the strongest partial in the same
 * window, and that partial's own amplitude is kept in dBFS, so every level can
 * be recovered as an absolute one.
 */
export function partialsAt(
  x: Float32Array,
  t: number,
  sampleRate: number,
): PartialWindow {
  const length = Math.round(PARTIAL_WINDOW_S * sampleRate);
  const from = Math.round(t * sampleRate) - Math.floor(length / 2);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let windowSum = 0;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * i) / (length - 1);
    const w =
      BH[0] -
      BH[1] * Math.cos(phase) +
      BH[2] * Math.cos(2 * phase) -
      BH[3] * Math.cos(3 * phase);
    const sample = x[from + i] ?? 0;
    re[i] = w * sample;
    windowSum += w;
    energy += sample * sample;
  }
  if (energy === 0) return { t, dbfs: null, partials: [] };
  fft(re, im);

  const half = FFT_SIZE / 2;
  const db = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++)
    db[k] = 20 * Math.log10(Math.hypot(re[k]!, im[k]!) || 1e-300);

  const peaks: { hz: number; db: number }[] = [];
  for (let k = 1; k < half; k++) {
    const [a, b, c] = [db[k - 1]!, db[k]!, db[k + 1]!];
    if (!(b > a && b >= c)) continue;
    const denom = a - 2 * b + c;
    const p = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    peaks.push({
      hz: ((k + p) * sampleRate) / FFT_SIZE,
      db: b - 0.25 * (a - c) * p,
    });
  }
  peaks.sort((m, n) => n.db - m.db);
  const top = peaks[0]!;
  // A sinusoid of amplitude A peaks at A times half the window's sum.
  const scale = 20 * Math.log10(windowSum / 2);
  const dbfs = top.db - scale;
  if (dbfs < PARTIAL_ABSOLUTE_FLOOR_DBFS)
    return { t, dbfs: null, partials: [] };
  return {
    t,
    dbfs: round(dbfs, 2),
    partials: peaks
      .filter(
        (p) =>
          p.db - top.db >= PARTIAL_FLOOR_DB &&
          p.db - scale >= PARTIAL_ABSOLUTE_FLOOR_DBFS,
      )
      .slice(0, MAX_PARTIALS)
      .map((p) => ({ hz: round(p.hz, 2), db: round(p.db - top.db, 2) })),
  };
}
