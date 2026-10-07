/**
 * Exact numbers for the cue fields. A field shows a stored value as
 * `String(v)`, the shortest text that reads back as the same double, and a
 * value shown in a derived unit must read back as exactly the stored one too.
 */

// A decimal number as a person types one: 40, -3, 0.5, .5, 40., 4e1, 1.5E-7
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** The number typed, or null for anything that is not a finite decimal. */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!DECIMAL.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Moves the decimal point of a decimal written in text, without arithmetic,
 * so nothing is rounded: shift('0.30000000000000004', 3) is
 * '300.00000000000004'. Writes plain digits where JavaScript would, and an
 * exponent where it would (below 1e-6, or from 1e21 up).
 */
function shift(text: string, places: number): string {
  const lower = text.toLowerCase();
  const negative = lower.startsWith('-');
  const body = lower.replace(/^[+-]/, '');
  const [mantissa = '', exponent = '0'] = body.split('e');
  const [whole = '', fraction = ''] = mantissa.split('.');
  let digits = whole + fraction;
  // How many of the digits sit before the decimal point
  let point = whole.length + Number(exponent) + places;

  const leading = digits.length - digits.replace(/^0+/, '').length;
  if (leading === digits.length) return '0';
  digits = digits.slice(leading).replace(/0+$/, '');
  point -= leading;

  let out: string;
  if (point - 1 >= 21 || point - 1 < -6) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    out = `${m}e${point - 1 >= 0 ? '+' : '-'}${Math.abs(point - 1)}`;
  } else if (point <= 0) {
    out = `0.${'0'.repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    out = digits + '0'.repeat(point - digits.length);
  } else {
    out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return negative ? `-${out}` : out;
}

/** Seconds as milliseconds, by moving the decimal point of `String(seconds)`. */
export function secondsAsMs(seconds: number): string {
  return shift(String(seconds), 3);
}

/**
 * Typed milliseconds as seconds, by moving the decimal point of the text
 * itself, so `40.1` is the double `0.0401` is, which `40.1 / 1000` is not.
 * Null for anything that is not a finite decimal.
 */
export function msAsSeconds(text: string): number | null {
  if (parseNumber(text) === null) return null;
  return Number(shift(text.trim(), -3));
}

/** A value moved by one step, rounded to the step's own decimals: 0.04 + 0.001 is 0.041. */
export function nudge(value: number, step: number, direction: 1 | -1): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number((value + direction * step).toFixed(decimals));
}
