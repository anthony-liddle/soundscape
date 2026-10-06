import type { Cue, CueDocument, CueInstrument, CueNote } from './types';

/**
 * Write a cue document in its one canonical form, so saving an unchanged
 * document reproduces its bytes exactly and a diff shows only what changed.
 *
 * - Keys in a fixed order everywhere: the order below, not the order an
 *   object happens to have been built in.
 * - Instruments and cues sorted by name, by UTF-16 code unit, so the result
 *   does not depend on locale or on insertion order.
 * - Notes kept in the order the author gave them. That order is data.
 * - Numbers as JavaScript writes them, the shortest form that reads back as
 *   the same double; -0 is written as 0, which is what JSON reads back.
 * - Two-space indentation and a trailing newline.
 *
 * The document should be valid (see validateCueDocument); this does not
 * validate it.
 */
const INSTRUMENT_ORDER: (keyof CueInstrument)[] = [
  'waveform',
  'pitchOffset',
  'attack',
  'decay',
  'sustain',
  'release',
  'envelopeCurve',
  'envelopeFloor',
  'filterType',
  'filterCutoff',
  'filterResonance',
  'delayTime',
  'delayFeedback',
  'delayMix',
  'distortion',
  'reverbMix',
  'lfoRate',
  'lfoDepth',
  'lfoTarget',
  'unisonDetune',
  'velocityResponse',
];
const NOTE_ORDER: (keyof CueNote)[] = ['id', 'instrument', 'start', 'duration', 'pitch', 'level'];

function ordered<T extends object>(value: T, order: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const v = value[key];
      out[key as string] = Object.is(v, -0) ? 0 : v;
    }
  }
  return out;
}

const byName = <T>(map: Record<string, T>): [string, T][] =>
  Object.keys(map)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => [name, map[name]!]);

export function serializeCueDocument(document: CueDocument): string {
  const instruments: Record<string, unknown> = {};
  for (const [name, instrument] of byName(document.instruments)) {
    instruments[name] = ordered(instrument, INSTRUMENT_ORDER);
  }
  const cues: Record<string, unknown> = {};
  for (const [name, cue] of byName<Cue>(document.cues)) {
    cues[name] = { notes: cue.notes.map((note) => ordered(note, NOTE_ORDER)) };
  }
  const canonical = {
    format: document.format,
    version: document.version,
    instruments,
    cues,
  };
  return JSON.stringify(canonical, null, 2) + '\n';
}
