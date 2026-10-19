// The bar a render of a song is held to, and a check that it sees a mistake.
//
//   node conformance/songs/bar.mjs --write   writes bar.json from the references
//   node conformance/songs/bar.mjs           judges, and writes bar-check.json
//
// A render passes when, against Chromium's and against WebKit's, in every 2 s
// window, both rules hold:
// 1. its difference sits at least 80 dB under the music, or, where the music
//    has died away, under 2^-24 of full scale;
// 2. measure() reads it within the widest spread between Chromium and WebKit
//    over the set, rounded up to each value's step, plus one step: Peach of a
//    Word's fixture rule, as the cue bar uses. No partial is gained, lost or
//    made strongest, and no window is silent in one only.
//
// The references commit measurements, never audio, so the first rule needs
// audio of both browsers: judging renders Chromium and WebKit fresh, through
// the engine built from this checkout, and first checks that their
// measurements match the committed ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildEngine } from '../cues/render/browser.mjs';
import { NO_SPREAD } from '../cues/measure/renderSpread.ts';
import { PLAYWRIGHT, SCENARIOS, renderSongs } from './render.mjs';
import { RULE, db1, measureWindows, meetsRule, spreadOf, toleranceFrom, wider, withinTolerance } from './compare.mjs';

const RATES = [48000, 44100];
const GAMES = Object.keys(SCENARIOS);
/** The track the mistake makes 0.5% louder in each game: the bass, and the bell. */
const MISTAKE = { rps: { track: 'track-bass', factor: 1.005 }, fm: { track: 'track002', factor: 1.005 } };

const here = new URL('.', import.meta.url);
const references = (game, rate) => JSON.parse(readFileSync(new URL(`references/${game}-${rate}.json`, here), 'utf8'));
/** A reference's windows for channel `c`: its one grid where its channels are identical. */
const gridOf = (render, c) => render.windows[render.channels === 'identical' ? 0 : c];

if (process.argv.includes('--write')) {
  const sets = {};
  for (const game of GAMES) {
    for (const rate of RATES) {
      const ref = references(game, rate);
      let spread = { ...NO_SPREAD, silentInOne: 0 };
      for (const c of [0, 1]) spread = wider(spread, spreadOf(gridOf(ref.renders.chromium, c), gridOf(ref.renders.webkit, c)));
      sets[`${game}-${rate}`] = { spread, tolerance: toleranceFrom(spread) };
    }
  }
  const bar = {
    about:
      "The bar a render of a song is held to, against Chromium's and WebKit's references, in every 2 s window. Written from the references by bar.mjs --write, before any other engine's render is held to it.",
    rule: {
      underMusicDb: RULE.underMusicDb,
      floorDbfs: Math.round(RULE.floorDbfs * 100) / 100,
      windowSeconds: 2,
      text:
        "In every window, against each reference: the difference at least 80 dB under the music, or under 2^-24 of full scale where the music has died away; and measure() within tolerance, the widest Chromium and WebKit spread over the set rounded up to each value's step, plus one step, with no partial gained, lost or made strongest and no window silent in one only.",
    },
    sets,
  };
  writeFileSync(new URL('bar.json', here), JSON.stringify(bar, null, 2) + '\n');
  for (const [name, { tolerance }] of Object.entries(sets)) console.log(name, JSON.stringify(tolerance));
  process.exit(0);
}

const bar = JSON.parse(readFileSync(new URL('bar.json', here), 'utf8'));
const engine = buildEngine();
const browsers = {};

/** A candidate's render against a reference's: both rules, both channels. */
function judge(candidate, reference, referenceGrid, tolerance, rate) {
  const from = reference.meta.playFrame;
  const rule1 = [0, 1].map((c) => meetsRule(reference.channels[c], candidate.channels[c], rate, from));
  let spread = { ...NO_SPREAD, silentInOne: 0 };
  for (const c of [0, 1]) spread = wider(spread, spreadOf(measureWindows(candidate.channels[c], rate, from), referenceGrid(c)));
  const worstUnder = Math.max(...rule1.flatMap((r) => r.windows.filter((w) => w.under !== null && !(w.level <= RULE.floorDbfs)).map((w) => w.under)));
  return {
    underMusic: { pass: rule1.every((r) => r.pass), worstWindowUnderMusicDb: db1(worstUnder) },
    measure: { pass: withinTolerance(spread, tolerance), spread },
    pass: rule1.every((r) => r.pass) && withinTolerance(spread, tolerance),
  };
}

const sets = {};
for (const game of GAMES) {
  for (const rate of RATES) {
    const ref = references(game, rate);
    const { tolerance } = bar.sets[`${game}-${rate}`];
    const job = { ...SCENARIOS[game], sampleRate: rate };
    const chromium = await renderSongs('chromium', [job, { ...job, mistake: MISTAKE[game] }]);
    const webkit = await renderSongs('webkit', [job]);
    browsers.chromium = chromium.version;
    browsers.webkit = webkit.version;
    const fresh = { chromium: chromium.renders[0], webkit: webkit.renders[0] };
    const mistake = chromium.renders[1];

    // The fresh renders measure as the committed references do, to a step
    const step = toleranceFrom({ ...NO_SPREAD });
    const matches = Object.fromEntries(
      ['chromium', 'webkit'].map((b) => {
        let spread = { ...NO_SPREAD, silentInOne: 0 };
        for (const c of [0, 1]) {
          spread = wider(spread, spreadOf(measureWindows(fresh[b].channels[c], rate, ref.playFrame), gridOf(ref.renders[b], c)));
        }
        return [b, withinTolerance(spread, step)];
      })
    );

    const against = (candidate) => ({
      chromium: judge(candidate, fresh.chromium, (c) => gridOf(ref.renders.chromium, c), tolerance, rate),
      webkit: judge(candidate, fresh.webkit, (c) => gridOf(ref.renders.webkit, c), tolerance, rate),
    });
    const webkitAgainstChromium = judge(fresh.webkit, fresh.chromium, (c) => gridOf(ref.renders.chromium, c), tolerance, rate);
    const chromiumAgainstWebkit = judge(fresh.chromium, fresh.webkit, (c) => gridOf(ref.renders.webkit, c), tolerance, rate);
    const withMistake = against(mistake);
    sets[`${game}-${rate}`] = {
      freshMatchesReferences: matches,
      webkitAgainstChromium,
      chromiumAgainstWebkit,
      mistake: { ...MISTAKE[game], judged: withMistake, fails: !withMistake.chromium.pass && !withMistake.webkit.pass },
    };
    console.log(
      `${game} ${rate}: fresh matches ${JSON.stringify(matches)}; WebKit against Chromium ${webkitAgainstChromium.pass ? 'passes' : 'FAILS'} ` +
        `(${webkitAgainstChromium.underMusic.worstWindowUnderMusicDb} dB); the mistake ${sets[`${game}-${rate}`].mistake.fails ? 'fails' : 'PASSES'}, ` +
        `${withMistake.chromium.underMusic.worstWindowUnderMusicDb} dB under against Chromium, measure() ${withMistake.chromium.measure.pass ? 'within' : 'outside'}`
    );
  }
}

writeFileSync(
  new URL('bar-check.json', here),
  JSON.stringify(
    {
      about:
        "The bar, checked: fresh Chromium and WebKit renders against the committed references; each browser judged against the other, which the bar must admit; and each game with one track 0.5% louder, which it must refuse.",
      engine,
      playwright: PLAYWRIGHT,
      browsers,
      sets,
    },
    null,
    2
  ) + '\n'
);
