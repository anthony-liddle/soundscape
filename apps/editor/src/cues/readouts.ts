import { midiToFrequency, midiToNoteName } from 'soundscape-engine';

/**
 * Readouts: derived from a stored value, shown beside its field, never stored.
 */

/** The note name and cents, the frequency, and how the pitch stands to the cue's first note. */
export function pitchReadout(pitch: number, firstPitch: number, isFirst: boolean): string {
  return `${midiToNoteName(pitch)}, ${midiToFrequency(pitch).toFixed(2)} Hz, ${relationToFirst(pitch, firstPitch, isFirst)}`;
}

/**
 * A whole-number multiple of note 1's frequency, to within 0.01 cents, is
 * named as a harmonic; anything else as semitones from note 1, whole to
 * within 0.1 cents, or to two places when not.
 */
export function relationToFirst(pitch: number, firstPitch: number, isFirst: boolean): string {
  if (isFirst) return 'note 1';
  const semitones = pitch - firstPitch;
  const k = Math.round(2 ** (semitones / 12));
  if (k >= 2 && Math.abs(semitones - 12 * Math.log2(k)) * 100 < 0.01) return `${k} × note 1`;
  const whole = Math.round(semitones);
  const amount = Math.abs(semitones - whole) * 100 < 0.1 ? String(whole) : semitones.toFixed(2);
  if (Number(amount) === 0) return 'unison with note 1';
  return `${semitones > 0 ? '+' : ''}${amount} st from note 1`;
}

/** A linear gain in decibels relative to full scale. */
export function dbfs(gain: number): string {
  return gain > 0 ? `${(20 * Math.log10(gain)).toFixed(2)} dBFS` : 'silent';
}

/** Seconds as stored, for a field edited in milliseconds. */
export function storedSeconds(seconds: number): string {
  return `${String(seconds)} s`;
}

/** Seconds as milliseconds to three places, for an envelope time. */
export function msReadout(seconds: number): string {
  return `${(seconds * 1000).toFixed(3)} ms`;
}
