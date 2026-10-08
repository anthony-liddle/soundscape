// Writes the corpus's case texts into cases/. Run once when a case is added;
// the texts are committed, and expect.mjs records what the engine answers.
//
//   node conformance/cues/build-cases.mjs --peach <path to peach.cues.json>
//
// The first 44 are the documents packages/engine/src/cues/__tests__/
// validate.test.ts builds, each the same change to the same valid document,
// in the test file's order. Two of its documents have no text form and are
// left out: a NaN level, which JSON cannot write, and an infinite start, which
// is written here by hand as 1e400. The rest are written by hand for what the
// Swift reader must get right, and Peach of a Word's cue file is copied in.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { peach: { type: 'string' } } });
if (!values.peach) throw new Error('--peach <path to peach.cues.json> is required');

const dir = new URL('./cases/', import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name, text) => writeFileSync(new URL(`${name}.json`, dir), text);

/** The valid document validate.test.ts starts from. */
function valid() {
  return {
    format: 'soundscape-cues',
    version: 1,
    instruments: {
      square: {
        waveform: 'square',
        pitchOffset: 0,
        attack: 0.07418049,
        decay: 0.05172575,
        sustain: 0,
        release: 0,
        envelopeCurve: 'exponential',
        envelopeFloor: 0.000018,
        filterType: 'none',
        filterCutoff: 1,
        filterResonance: 0,
        delayTime: 0,
        delayFeedback: 0,
        delayMix: 0,
        distortion: 0,
        reverbMix: 0,
        lfoRate: 0,
        lfoDepth: 0,
        lfoTarget: 'pitch',
        unisonDetune: 0,
        velocityResponse: 0,
      },
    },
    cues: {
      tick: {
        notes: [{ id: 'tick-1', instrument: 'square', start: 0, duration: 0.03, pitch: 81, level: 0.0216 }],
      },
    },
  };
}
const text = (doc) => JSON.stringify(doc, null, 2) + '\n';
const withChange = (change) => {
  const doc = valid();
  change(doc);
  return text(doc);
};
const untilRelease = (d) => {
  delete d.instruments.square.decay;
  d.instruments.square.decayUntilRelease = true;
};

// From validate.test.ts, in its order
write('test-valid', text(valid()));
write('test-unknown-key-top', withChange((d) => (d.extra = 1)));
write('test-unknown-key-instrument', withChange((d) => (d.instruments.square.volume = 1)));
write('test-unknown-key-cue', withChange((d) => (d.cues.tick.loop = true)));
write('test-unknown-key-note', withChange((d) => (d.cues.tick.notes[0].velocity = 100)));
write('test-required-level', withChange((d) => delete d.cues.tick.notes[0].level));
write('test-required-reverb-mix', withChange((d) => delete d.instruments.square.reverbMix));
write('test-required-instruments', withChange((d) => delete d.instruments));
write('test-level-0', withChange((d) => (d.cues.tick.notes[0].level = 0)));
write('test-level-above-1', withChange((d) => (d.cues.tick.notes[0].level = 1.5)));
write('test-level-at-floor', withChange((d) => (d.cues.tick.notes[0].level = 0.000018)));
write('test-negative-start', withChange((d) => (d.cues.tick.notes[0].start = -0.01)));
write('test-zero-duration', withChange((d) => (d.cues.tick.notes[0].duration = 0)));
write('test-pitch-over-127', withChange((d) => (d.cues.tick.notes[0].pitch = 127.5)));
write('test-normalized-over-1', withChange((d) => (d.instruments.square.attack = 1.2)));
write('test-pitch-offset-past-two-octaves', withChange((d) => (d.instruments.square.pitchOffset = 25)));
write('test-floor-of-1', withChange((d) => (d.instruments.square.envelopeFloor = 1)));
write('test-string-pitch', withChange((d) => (d.cues.tick.notes[0].pitch = '81')));
write('test-reverb-mix', withChange((d) => (d.instruments.square.reverbMix = 0.2)));
write('test-velocity-response', withChange((d) => (d.instruments.square.velocityResponse = 0.5)));
write('test-no-floor', withChange((d) => delete d.instruments.square.envelopeFloor));
write('test-linear-with-floor', withChange((d) => (d.instruments.square.envelopeCurve = 'linear')));
write('test-lfo-on-missing-filter', withChange((d) => Object.assign(d.instruments.square, { lfoDepth: 0.2, lfoTarget: 'filter' })));
write('test-waveform-noise', withChange((d) => (d.instruments.square.waveform = 'noise')));
write('test-decay-until-release', withChange(untilRelease));
write('test-decay-until-release-and-decay', withChange((d) => {
  untilRelease(d);
  d.instruments.square.decay = 0.05172575;
}));
for (const [name, value] of [['false', false], ['1', 1], ['string', 'true'], ['null', null]]) {
  write(`test-decay-until-release-${name}`, withChange((d) => (d.instruments.square.decayUntilRelease = value)));
}
write('test-no-decay', withChange((d) => delete d.instruments.square.decay));
write('test-undefined-instrument', withChange((d) => (d.cues.tick.notes[0].instrument = 'sine')));
write('test-instrument-to-string', withChange((d) => (d.cues.tick.notes[0].instrument = 'toString')));
write('test-duplicate-note-id', withChange((d) => (d.cues.tock = { notes: [{ ...d.cues.tick.notes[0] }] })));
const pretty = JSON.stringify(valid(), null, 2);
write('test-two-ticks', pretty.replace('"cues": {', '"cues": {\n    "tick": { "notes": [] },') + '\n');
write('test-two-squares', pretty.replace('"instruments": {', '"instruments": {\n    "square": {},') + '\n');
write('test-name-two-words', withChange((d) => (d.cues['two words'] = { notes: [] })));
write('test-empty-id', withChange((d) => (d.cues.tick.notes[0].id = '')));
write('test-proto-cue-name', JSON.stringify(valid()).replace('"tick":', '"__proto__":') + '\n');
write('test-version-2', withChange((d) => (d.version = 2)));
write('test-format-soundscape', withChange((d) => (d.format = 'soundscape')));
write('test-null', 'null\n');
write('test-not-json', '{ "format": ');
write('test-collects-all', withChange((d) => {
  d.version = 2;
  d.cues.tick.notes[0].level = 2;
  d.cues.tick.notes[0].instrument = 'missing';
}));

// Written by hand: numbers JSON can only write as an overflow
write('hand-infinite-start', pretty.replace('"start": 0,', '"start": 1e400,') + '\n');
write('hand-level-1e400', pretty.replace('"level": 0.0216', '"level": 1e400') + '\n');

// Written by hand: where Foundation's readers part from JSON.parse
write('foundation-repeated-key', pretty.replace('"level": 0.0216', '"level": 2,\n          "level": 0.5') + '\n');
write('foundation-repeated-key-escaped', pretty.replace('"level": 0.0216', '"level": 0.0216,\n          "\\u006cevel": 2') + '\n');
write('foundation-trailing-comma', pretty.replace('"level": 0.0216', '"level": 0.0216,') + '\n');
write('foundation-integer-like-names', pretty.replace('"cues": {', '"cues": {\n    "b": { "notes": [{}] },\n    "4294967295": { "notes": [] },\n    "2": { "notes": [{}] },') + '\n');
write('foundation-decay-until-release-1', pretty.replace('"decay": 0.05172575', '"decayUntilRelease": 1') + '\n');
write('foundation-lone-surrogate-name', pretty.replace('"tick": {', '"\\ud800": {') + '\n');

// Written by hand: other things a reader can get wrong
write('ids-differing-only-in-lone-surrogates', withChange((d) => {
  const note = d.cues.tick.notes[0];
  d.cues.tick.notes = [{ ...note, id: '\ud800' }, { ...note, id: '\udc00' }, { ...note, id: '\ud800' }];
}));
write('version-nested', pretty.replace('"version": 1', '"version": [1, { "b": -0, "a": 1e400, "1": "\\ud800\\n" }]') + '\n');
write('number-forms', pretty.replace('"pitch": 81', '"pitch": 8.1E1').replace('"start": 0', '"start": -0').replace('"duration": 0.03', '"duration": 3e-2') + '\n');
write('level-written-as-exponent-at-floor', pretty.replace('"level": 0.0216', '"level": 1.8e-5') + '\n');
write('top-level-array', '[]\n');
write('byte-order-mark', '﻿' + pretty + '\n');

// Peach of a Word's cue file, accepted
write('peach-of-a-word', readFileSync(values.peach, 'utf8'));
