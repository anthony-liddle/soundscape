// What the references cover, shared by references.mjs, bar.mjs and judge.mjs.
import { readFileSync } from 'node:fs';
import { PAIR_SPLIT_S } from '../measure/soundMeasure.ts';

const here = new URL('./', import.meta.url);

/**
 * The sets of cues. Peach's, all but its departures, are held to Chromium,
 * Firefox and WebKit. The frozen Chrome 154 fixture, its old engine's sound at
 * its own level, holds the positive controls alone since Peach's mix of 9
 * November 2026 (bar.mjs). The others are held to Chromium and WebKit, where
 * Firefox stops being a reference for the full feature set (decisions.md):
 * one cue per oscillator and envelope feature Peach does not use, then the
 * filters, LFOs and unison, then delay and distortion.
 */
export const SETS = {
  peach: {
    document: new URL('../cases/peach-of-a-word.json', here),
    browsers: ['chromium', 'firefox', 'webkit'],
    except: 'departures',
  },
  // Peach's departures, the cues it chose by ear after Soundscape: clicks a few
  // milliseconds long, which Firefox starts on the next frame at 44.1 kHz and
  // so measures apart from Chromium and WebKit. Held to those two, as every
  // set past Peach's first is, with Firefox rendered and recorded beside them.
  // Kept apart so Peach's own bar stays the discovery's. From the same
  // document, so the copy Peach pins is the one tested.
  'peach-departures': {
    document: new URL('../cases/peach-of-a-word.json', here),
    browsers: ['chromium', 'webkit'],
    recorded: ['chromium', 'webkit', 'firefox'],
    only: 'departures',
  },
  features: { document: new URL('features.cues.json', here), browsers: ['chromium', 'webkit'] },
  // Filters, LFOs and unison: held to Chromium and WebKit, with Firefox rendered
  // and recorded beside them, never held to. Made with the published engine.
  filters: {
    document: new URL('filters.cues.json', here),
    browsers: ['chromium', 'webkit'],
    recorded: ['chromium', 'webkit', 'firefox'],
    engine: { npm: 'soundscape-engine', version: '0.4.1' },
  },
  modulation: {
    document: new URL('modulation.cues.json', here),
    browsers: ['chromium', 'webkit'],
    recorded: ['chromium', 'webkit', 'firefox'],
    engine: { npm: 'soundscape-engine', version: '0.4.1' },
  },
  // Delay and distortion: rendered until the engine would disconnect the
  // cue's effects chain, by its own 2^-24 rule, and silent from there.
  delay: {
    document: new URL('delay.cues.json', here),
    browsers: ['chromium', 'webkit'],
    recorded: ['chromium', 'webkit', 'firefox'],
    engine: { npm: 'soundscape-engine', version: '0.4.1' },
    untilTheChainGoes: true,
  },
  // The longest echo a cue can have, feedback 0.9 at a 1 s delay, rendered to
  // its deadline at 158 s: a set of its own, so its bar is its own.
  echo: {
    document: new URL('echo.cues.json', here),
    browsers: ['chromium', 'webkit'],
    recorded: ['chromium', 'webkit', 'firefox'],
    engine: { npm: 'soundscape-engine', version: '0.4.1' },
    untilTheChainGoes: true,
  },
  distortion: {
    document: new URL('distortion.cues.json', here),
    browsers: ['chromium', 'webkit'],
    recorded: ['chromium', 'webkit', 'firefox'],
    engine: { npm: 'soundscape-engine', version: '0.4.1' },
    untilTheChainGoes: true,
  },
};

/** The browsers a set is rendered in: those it is held to, and any recorded beside them. */
export const recordedBrowsers = (set) => SETS[set].recorded ?? SETS[set].browsers;

/**
 * Peach's cues that left its old engine on purpose, chosen by ear on 5 November
 * 2026, as Peach's own src/audio/departures.ts lists them: the tick, now two
 * clicks where it was an 880 Hz square, and Shuffle, which made no sound
 * before. The fixture is the old engine's sound, so it holds neither. They
 * are the peach-departures set, and the peach set is every other Peach cue.
 * ReferenceRenders.swift lists them too.
 */
export const PEACH_DEPARTURES = ['tick', 'shuffle'];

/**
 * The positive controls' own cues and references, frozen: Peach's document as
 * it was before its departures, byte for byte (SHA-256 b66a60d7...445f615f),
 * and the Peach references rendered from it, kept as they were. The controls
 * make the discovery's three cues wrong on purpose and must miss the
 * discovery's bar, so they stay on the sound that bar was set on, the old tick
 * and its square included. Never rendered again.
 */
export const FROZEN_CONTROLS = {
  document: new URL('controls.cues.json', here),
  set: 'controls',
  rate: 48000,
  cues: ['tick', 'found-8-mythic-cute', 'edition'],
  // The frozen references' browsers and Peach's frozen Chrome 154 fixture, the
  // old engine's sound, which the first document plays at its own level
  references: ['chromium', 'firefox', 'webkit', 'fixture'],
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
/** A set's cues, in its document's order: all of them, or only or all but Peach's departures. */
export const cueNames = (set) => {
  const all = Object.keys(JSON.parse(documentText(set)).cues);
  if (SETS[set].only === 'departures') return all.filter((cue) => PEACH_DEPARTURES.includes(cue));
  if (SETS[set].except === 'departures') return all.filter((cue) => !PEACH_DEPARTURES.includes(cue));
  return all;
};

export const referencePath = (set, rate) => new URL(`references/${set}-${rate}.json`, here);
export const readReferences = (set, rate) => JSON.parse(readFileSync(referencePath(set, rate), 'utf8'));
export const fixturePath = new URL('references/fixture-chrome-154.json', here);
export const readFixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
