import type { InstrumentParams } from '../types';

/**
 * A cue document: short sound-effect recipes, each a handful of notes at exact
 * offsets in seconds, played on the audio clock and the same every time.
 *
 * It is a document of its own, not part of a soundscape. It carries its own
 * instruments, so a cue never depends on presets stored anywhere else, and a
 * version, so the format has somewhere to go.
 *
 * Nothing in it is derived from anything else in it. Every value is one an
 * author chose, so an editor can rewrite any of them without recomputing the
 * rest, and saving an unchanged document reproduces its bytes exactly (see
 * {@link serializeCueDocument}).
 */
export interface CueDocument {
  /** Always `'soundscape-cues'`, so a cue file cannot be mistaken for anything else. */
  format: typeof CUE_FORMAT;
  /** The format version. 1 is the only one so far. */
  version: typeof CUE_VERSION;
  /** The document's own instruments, by name. Notes refer to them by that name. */
  instruments: Record<string, CueInstrument>;
  /** The cues, by name. A cue is played by its name. */
  cues: Record<string, Cue>;
}

export const CUE_FORMAT = 'soundscape-cues';
export const CUE_VERSION = 1;

/**
 * An instrument spelled out in full. Every field of {@link InstrumentParams} is
 * required, including the ones a preset may omit, so nothing falls back to a
 * default: a cue sounds the way its file says. `envelopeFloor` is present
 * exactly when `envelopeCurve` is `'exponential'`.
 *
 * The decay is one of two things, and the instrument carries exactly one:
 * `decay`, a fixed length, or `decayUntilRelease: true`, a decay that runs
 * from the end of the attack to each note's release, however long the note
 * is. So one instrument serves notes of any length, each fading over its own.
 *
 * Two fields are fixed for now. `velocityResponse` must be 0, because a cue
 * note's level is its peak and velocity plays no part. `reverbMix` must be 0,
 * because the reverb's impulse response is random and a cue must sound the
 * same every time.
 */
export type CueInstrument = Required<Omit<InstrumentParams, 'envelopeFloor' | 'decay'>> &
  Pick<InstrumentParams, 'envelopeFloor'> &
  CueDecay;

/** A cue instrument's decay: a fixed length, or until each note's release. Never both. */
export type CueDecay =
  | { decay: number; decayUntilRelease?: never }
  | {
      /**
       * The decay runs from the end of the attack to the note's release, and
       * reaches the sustain level there. Only `true`; leave it out for a decay
       * of fixed length.
       */
      decayUntilRelease: true;
      decay?: never;
    };

/** One cue: its notes, in any order. */
export interface Cue {
  notes: CueNote[];
}

/** One note of a cue. */
export interface CueNote {
  /** Stable and unique across the whole document. */
  id: string;
  /** The name of an instrument in the same document. */
  instrument: string;
  /** Seconds from the moment the cue is played. */
  start: number;
  /**
   * Seconds until the note is released. The release then runs for the
   * instrument's release time, and the oscillators stop 10 ms after that.
   */
  duration: number;
  /** MIDI pitch, 0 to 127. Fractional values are exact: 69.5 is a quarter tone above A4. */
  pitch: number;
  /**
   * The envelope's peak, as a linear gain applied to an oscillator whose
   * waveform peaks at 1, measured at the cue output with its volume at 1. A
   * sine note of level 0.5 peaks at 0.5, which is -6.02 dBFS. No velocity and
   * no ceiling stand between this number and the output. Above 0, at most 1,
   * and above the instrument's floor when its envelope is exponential.
   * (Band-limited square and sawtooth waves overshoot 1 slightly at their
   * edges, and unison doubles the oscillators, so their peaks run higher.)
   */
  level: number;
}

/** One reason a cue document was rejected, with the path to the bad value. */
export interface CueProblem {
  /** Where, for example `cues.tick.notes[0].level`. Empty for the document itself. */
  path: string;
  message: string;
}

export type CueValidation =
  | { ok: true; document: CueDocument }
  | { ok: false; problems: CueProblem[] };

/** Thrown when an invalid cue document is loaded into the engine. */
export class CueDocumentError extends Error {
  readonly problems: CueProblem[];
  constructor(problems: CueProblem[]) {
    super(
      'Invalid cue document:\n' +
        problems.map((p) => `  ${p.path || '(document)'}: ${p.message}`).join('\n')
    );
    this.name = 'CueDocumentError';
    this.problems = problems;
  }
}
