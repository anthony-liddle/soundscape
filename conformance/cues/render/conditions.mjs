// What the references cover, shared by references.mjs, bar.mjs and judge.mjs.
import { readFileSync } from 'node:fs';
import { PAIR_SPLIT_S } from '../measure/soundMeasure.ts';

const here = new URL('./', import.meta.url);

/**
 * The two sets of cues. Peach's 34 are held to Chromium, Firefox, WebKit and
 * the frozen Chrome 154 fixture. The others, one per oscillator and envelope
 * feature Peach does not use, are held to Chromium and WebKit, where Firefox
 * stops being a reference for the full feature set (decisions.md).
 */
export const SETS = {
  peach: { document: new URL('../cases/peach-of-a-word.json', here), browsers: ['chromium', 'firefox', 'webkit'] },
  features: { document: new URL('features.cues.json', here), browsers: ['chromium', 'webkit'] },
};

/** Both rates, because the player pass decides which one cues render at. */
export const RATES = [48000, 44100];

/**
 * Each cue starts at 0, and again at 8.0027 s, the discovery's late start: 3001
 * render quanta at 48 kHz, so a large clock is tested. At 44.1 kHz it falls
 * between frames, at 352,917.6, so the start's fraction is tested too.
 */
export const STARTS = { 0: 0, 8.0027: (3001 * 128) / 48000 };

/** Every render is this long, from the frame on or before its start. */
export const SECONDS = 2;

/** The rejected guess is also read note by note, as Peach's fixture reads it. */
export const optionsFor = (cue) => (cue === 'invalid' ? { pairSplitS: PAIR_SPLIT_S } : {});

export const documentText = (set) => readFileSync(SETS[set].document, 'utf8');
export const cueNames = (set) => Object.keys(JSON.parse(documentText(set)).cues);

export const referencePath = (set, rate) => new URL(`references/${set}-${rate}.json`, here);
export const readReferences = (set, rate) => JSON.parse(readFileSync(referencePath(set, rate), 'utf8'));
export const fixturePath = new URL('references/fixture-chrome-154.json', here);
export const readFixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
