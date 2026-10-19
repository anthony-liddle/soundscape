// Records both games' music, as the references hold it: each game as the
// scenarios in render.mjs play it, with the reverb and the compressor in, at
// 48 and 44.1 kHz, through the engine built from this checkout, in Chromium
// and WebKit in lockstep and Firefox laid out ahead. Writes measurements and
// per-window differences, never audio, to references/<game>-<rate>.json.
//
//   node conformance/songs/references.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildEngine } from '../cues/render/browser.mjs';
import { MODES, PLAYWRIGHT, SCENARIOS, renderSongs } from './render.mjs';
import { db1, differenceDbfs, largestGap, measureWindows, underMusic, worst } from './compare.mjs';

export const RATES = [48000, 44100];
export const BROWSERS = ['chromium', 'webkit', 'firefox'];
const engine = buildEngine();
mkdirSync(new URL('references/', import.meta.url), { recursive: true });

const sameChannels = (r) => largestGap(r.channels[0], r.channels[1]).max === 0;

/** JSON indented by one, with each window's measurement, and each list of numbers, on a line of its own. */
function linesOf(value) {
  const compact = [];
  const marked = JSON.stringify(
    value,
    (key, v) => {
      const isMeasurement = v && typeof v === 'object' && !Array.isArray(v) && 'envelopeDbfs' in v;
      const isNumbers = Array.isArray(v) && v.length > 0 && v.every((x) => typeof x !== 'object' || x === null);
      if (isMeasurement || isNumbers) {
        compact.push(JSON.stringify(v));
        return `@@${compact.length - 1}@@`;
      }
      return v;
    },
    1
  );
  return marked.replace(/"@@(\d+)@@"/g, (_, i) => compact[Number(i)]) + '\n';
}

for (const rate of RATES) {
  for (const game of Object.keys(SCENARIOS)) {
    const job = { ...SCENARIOS[game], sampleRate: rate };
    const renders = {};
    const versions = {};
    const browsers = {};
    for (const browser of BROWSERS) {
      // Twice, to record each browser's own run-to-run gap
      const { version, renders: [first, again] } = await renderSongs(browser, [job, job]);
      versions[browser] = version;
      renders[browser] = first;
      const from = first.meta.playFrame;
      const runToRun = Math.max(...[0, 1].map((c) => worst(underMusic(first.channels[c], again.channels[c], rate, from))));
      const identical = sameChannels(first);
      browsers[browser] = {
        mode: MODES[browser],
        notes: first.meta.played,
        steals: first.meta.steals,
        thrown: first.meta.thrown.length + first.meta.reported.length,
        runToRunWorstWindowUnderMusicDb: db1(runToRun),
        channels: identical ? 'identical' : 'two',
        windows: (identical ? [0] : [0, 1]).map((c) => measureWindows(first.channels[c], rate, from)),
      };
    }
    const from = renders.chromium.meta.playFrame;
    const against = (a, b) =>
      [0, 1].map((c) => ({
        underMusicDb: underMusic(renders[a].channels[c], renders[b].channels[c], rate, from).map(db1),
        differenceDbfs: differenceDbfs(renders[a].channels[c], renders[b].channels[c], rate, from).map(db1),
      }));
    const out = {
      about:
        `${game === 'rps' ? 'Rock Paper Scissors' : 'The Forgetting Machine'} at ${rate} Hz, as SCENARIOS in render.mjs plays it, ` +
        'with the reverb and the compressor in. Per 2 s window from the frame the game starts the music on: measure() of each channel, ' +
        "once where the two are identical, and the difference between browsers, under the music and as its own level. Chromium and WebKit, rendered in lockstep, are what a render is held to; Firefox, laid out ahead, is recorded beside them, never held to.",
      engine,
      playwright: PLAYWRIGHT,
      browsers: versions,
      rate,
      scenario: job,
      windowSeconds: 2,
      playFrame: from,
      renders: browsers,
      differences: { 'chromium-webkit': against('chromium', 'webkit'), 'chromium-firefox': against('chromium', 'firefox') },
    };
    writeFileSync(new URL(`references/${game}-${rate}.json`, import.meta.url), linesOf(out));
    const cw = Math.max(...out.differences['chromium-webkit'].map((d) => worst(d.underMusicDb.filter((x) => typeof x === 'number'))));
    console.log(`${game} ${rate}: Chromium and WebKit ${cw} dB under the music in their worst window; run to run ${BROWSERS.map((b) => `${b} ${browsers[b].runToRunWorstWindowUnderMusicDb}`).join(', ')}`);
  }
}
