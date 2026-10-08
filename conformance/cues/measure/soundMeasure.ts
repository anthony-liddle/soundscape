import {
  MAX_PARTIALS,
  PARTIAL_ABSOLUTE_FLOOR_DBFS,
  PARTIAL_FLOOR_DB,
  PARTIAL_WINDOW_S,
  partialsAt,
  type PartialWindow,
} from './spectrum.ts';

/**
 * Measurements of one rendered sound, for the baseline the Soundscape port will
 * be held to. Each one is defined here, in METHOD, in words, and written into
 * the fixture beside the numbers, so the later pass can compute the same thing
 * on the new engine rather than something with the same name.
 */

/** Onset and end are where the level first and last reach this far below peak. */
export const THRESHOLD_DB = -40;

/** The fundamental is read over this long a window from the onset. */
export const PITCH_WINDOW_S = 0.04;

/**
 * The envelope is the largest sample magnitude in a window this wide, centred on
 * each point. A peak rather than an RMS: over a window this short, RMS moves by
 * a few tenths of a dB with the phase the window happens to catch, and a peak
 * over at least one period does not. 10 ms is a whole period down to 100 Hz,
 * and the lowest note the engine plays is 174.61 Hz.
 */
export const ENVELOPE_WINDOW_S = 0.01;

/** Fixed points, in seconds after the cue is called, where the envelope is read. */
export const ENVELOPE_TIMES_S = [
  0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6,
] as const;

/**
 * Fixed times, in seconds after the cue is called, where the strongest partials
 * are read, each over a 40 ms window centred on it. Chosen against the found
 * cue's schedule so that each layer of the rung ladder has a window of its own:
 *
 *   0.02   the note and its octave alone (window 0 to 40 ms), before any sparkle
 *   0.065  the rung sparkle at 3x near its peak (45 to 85 ms), before the glints
 *   0.11   the mythic glint at 4x near its peak (90 to 130 ms), before the cute one
 *   0.155  the cute glint at 5x near its peak (135 to 175 ms)
 *   0.3, 0.6, 1.2  the later notes of the source arpeggio and the Edition chord
 */
export const SPECTRUM_TIMES_S = [
  0.02, 0.065, 0.11, 0.155, 0.3, 0.6, 1.2,
] as const;

/**
 * The rejected-guess cue's second note starts this long after its first: the
 * engine plays INVALID_NOTES 80 ms apart. The one place the two can be told
 * apart is in time, so this is where the cue is split.
 */
export const PAIR_SPLIT_S = 0.08;

export const METHOD = {
  time: 'Seconds from the moment the cue is called. Every cue schedules its first note at that moment.',
  onset: `The first sample whose magnitude is within ${-THRESHOLD_DB} dB of the sound's own peak.`,
  end: `The last sample whose magnitude is within ${-THRESHOLD_DB} dB of the sound's own peak.`,
  duration: 'end minus onset.',
  stop: 'The time just after the last non-zero sample: where the oscillators stop.',
  peak: 'The largest sample magnitude, in dBFS (1.0 is 0 dBFS).',
  rms: 'The RMS level from onset to end, in dBFS.',
  fundamental: `The pitch of the first note to sound, over ${PITCH_WINDOW_S * 1000} ms from the onset: a YIN period estimate, refined to the peak of the Hann-windowed spectrum within 3% of it. For source and edition that is the first arpeggio note, for invalid the first of the pair; for a found word it is the note its length plays, under the octave shimmer and any sparkle.`,
  envelope: `The largest sample magnitude, in dBFS, within a ${ENVELOPE_WINDOW_S * 1000} ms window centred on each time in envelopeTimes. null where every sample in the window is zero.`,
  spectrum: `The strongest partials in a ${PARTIAL_WINDOW_S * 1000} ms Blackman-Harris window centred on each time in spectrumTimes, from a zero-padded FFT, each refined by a parabola through its peak bin. Up to ${MAX_PARTIALS}, strongest first, down to ${-PARTIAL_FLOOR_DB} dB under the window's strongest and never under ${PARTIAL_ABSOLUTE_FLOOR_DBFS} dBFS. Each level is relative to the strongest partial in its own window, so at 155 ms that is the glint in a cute mythic sound and the main note in its letterpress twin; dbfs is that strongest partial's amplitude, so every level can be made absolute. A window is null when it is silent or under the absolute floor. Partials closer than about 50 Hz are not resolved in one window: the invalid pair, 196 and 174.61 Hz, reads as one where both sound. See pair for that cue.`,
  pair: `The rejected-guess cue only. Its two notes, 21.4 Hz apart, cannot be separated in frequency by any window: they are sequential, ${PAIR_SPLIT_S * 1000} ms apart, so a window long enough to resolve 21 Hz holds both, and their offset puts fringes every ${Math.round((1 / PAIR_SPLIT_S) * 10) / 10} Hz through the spectrum, finer than the gap between them; each note also decays in about 17 ms, which widens it to about 18 Hz on its own. Nor can a beat be measured: the two are within 10 dB of each other for about 3 ms, against a 46.8 ms beat period. So each note is read alone, in time, over as much of the cue as it has to itself: the first from the call to ${PAIR_SPLIT_S * 1000} ms, where the second starts; the second from there to the stop, with the first 34 dB under it at the start of that span and falling. hz is that note's fundamental, measured as fundamental is. db is its level relative to the first note, from the magnitude of its untapered spectrum at its own frequency. That still moves with the phase the oscillator starts at, by up to about 0.2 dB on this cue, because a note this short overlaps its own mirror image at minus its frequency; a peak sample moves by about 1.1 dB. intervalSemitones is 12 log2 of the first frequency over the second.`,
} as const;

export interface PairNote {
  /** The span the note is read over, in seconds after the cue is called. */
  from: number;
  to: number;
  hz: number;
  /** Level relative to the first note. */
  db: number;
}

export interface NotePair {
  notes: [PairNote, PairNote];
  intervalSemitones: number;
}

export interface Measurement {
  onset: number;
  end: number;
  duration: number;
  stop: number;
  peakDbfs: number;
  rmsDbfs: number;
  fundamentalHz: number | null;
  envelopeDbfs: (number | null)[];
  spectrum: PartialWindow[];
  /** Only for a cue measured with a split: the rejected guess. */
  pair?: NotePair;
}

const dbfs = (linear: number): number => 20 * Math.log10(linear);

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

function rms(x: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
}

function peakOf(x: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(x[i]!));
  return peak;
}

/**
 * The period of the strongest repeating shape, in samples, by YIN: the
 * cumulative-mean-normalised difference function, its first dip under 0.1, and
 * a parabola through that dip.
 */
function yinPeriod(x: Float32Array, minTau: number, maxTau: number): number {
  const width = x.length - maxTau;
  const d = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < width; j++) {
      const diff = x[j]! - x[j + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmnd = new Float64Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau]!;
    cmnd[tau] = running === 0 ? 1 : (d[tau]! * tau) / running;
  }
  let best = -1;
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmnd[tau]! < 0.1) {
      while (tau + 1 < maxTau && cmnd[tau + 1]! < cmnd[tau]!) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    best = minTau;
    for (let tau = minTau; tau < maxTau; tau++)
      if (cmnd[tau]! < cmnd[best]!) best = tau;
  }
  const a = cmnd[best - 1] ?? cmnd[best]!;
  const b = cmnd[best]!;
  const c = cmnd[best + 1] ?? cmnd[best]!;
  const denom = a - 2 * b + c;
  return denom === 0 ? best : best + (a - c) / (2 * denom);
}

/** Magnitude of the Hann-windowed spectrum of `x` at `hz`. */
function spectrumAt(x: Float32Array, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  const n = x.length;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re += hann * x[i]! * Math.cos(w * i);
    im -= hann * x[i]! * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/** Golden-section search for the spectral peak between lo and hi. */
function refinePeak(
  x: Float32Array,
  lo: number,
  hi: number,
  sampleRate: number,
): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = spectrumAt(x, c, sampleRate);
  let fd = spectrumAt(x, d, sampleRate);
  while (b - a > 1e-4) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = spectrumAt(x, c, sampleRate);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = spectrumAt(x, d, sampleRate);
    }
  }
  return (a + b) / 2;
}

/** The fundamental of `x`, between 80 Hz and 4 kHz, or null if it is silent. */
export function fundamental(
  x: Float32Array,
  sampleRate: number,
): number | null {
  if (rms(x, 0, x.length) === 0) return null;
  const minTau = Math.floor(sampleRate / 4000);
  const maxTau = Math.min(
    Math.floor(sampleRate / 80),
    Math.floor(x.length / 2),
  );
  const coarse = sampleRate / yinPeriod(x, minTau, maxTau);
  return refinePeak(x, coarse * 0.97, coarse * 1.03, sampleRate);
}

/** Magnitude of the untapered spectrum of `x` at `hz`: far steadier across phase than a peak sample. */
function levelAt(x: Float32Array, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    re += x[i]! * Math.cos(w * i);
    im -= x[i]! * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/**
 * Two sequential notes, each read alone over the span it has to itself: the
 * first up to `splitS`, the second from there to the last sound. See
 * METHOD.pair for why in time and not in frequency.
 */
export function notePair(
  x: Float32Array,
  sampleRate: number,
  splitS: number,
): NotePair {
  let last = x.length - 1;
  while (last > 0 && x[last] === 0) last--;
  const split = Math.round(splitS * sampleRate);
  const spans = [
    [0, split],
    [split, last + 1],
  ] as const;
  const read = spans.map(([from, to]) => {
    const segment = x.subarray(from, to);
    const hz = fundamental(segment, sampleRate);
    if (hz === null) throw new Error('A note of the pair is silent.');
    return { from, to, hz, level: levelAt(segment, hz, sampleRate) };
  });
  const [a, b] = read as [(typeof read)[0], (typeof read)[0]];
  const note = (n: typeof a): PairNote => ({
    from: round(n.from / sampleRate, 5),
    to: round(n.to / sampleRate, 5),
    hz: round(n.hz, 2),
    db: round(20 * Math.log10(n.level / a.level), 2),
  });
  return {
    notes: [note(a), note(b)],
    intervalSemitones: round(12 * Math.log2(a.hz / b.hz), 3),
  };
}

export function measure(
  x: Float32Array,
  sampleRate: number,
  options: { pairSplitS?: number } = {},
): Measurement {
  let peak = 0;
  let last = -1;
  for (let i = 0; i < x.length; i++) {
    const m = Math.abs(x[i]!);
    if (m > peak) peak = m;
    if (m > 0) last = i;
  }
  if (peak === 0) throw new Error('The render is silent.');

  const floor = peak * 10 ** (THRESHOLD_DB / 20);
  let onset = 0;
  while (Math.abs(x[onset]!) < floor) onset++;
  let end = x.length - 1;
  while (Math.abs(x[end]!) < floor) end--;

  const pitchTo = Math.min(
    end + 1,
    onset + Math.round(PITCH_WINDOW_S * sampleRate),
  );
  const half = Math.round((ENVELOPE_WINDOW_S * sampleRate) / 2);
  const envelopeDbfs = ENVELOPE_TIMES_S.map((t) => {
    const at = Math.round(t * sampleRate);
    const level = peakOf(
      x,
      Math.max(0, at - half),
      Math.min(x.length, at + half),
    );
    return level === 0 ? null : round(dbfs(level), 2);
  });

  const hz = fundamental(x.subarray(onset, pitchTo), sampleRate);
  return {
    onset: round(onset / sampleRate, 5),
    end: round(end / sampleRate, 5),
    duration: round((end - onset) / sampleRate, 5),
    stop: round((last + 1) / sampleRate, 5),
    peakDbfs: round(dbfs(peak), 2),
    rmsDbfs: round(dbfs(rms(x, onset, end + 1)), 2),
    fundamentalHz: hz === null ? null : round(hz, 2),
    envelopeDbfs,
    spectrum: SPECTRUM_TIMES_S.map((t) => partialsAt(x, t, sampleRate)),
    ...(options.pairSplitS !== undefined && {
      pair: notePair(x, sampleRate, options.pairSplitS),
    }),
  };
}
