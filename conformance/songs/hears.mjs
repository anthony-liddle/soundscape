// What each game hears change: its music on today's engine, soundscape-engine
// 0.4.1 from npm, against the engine built from this checkout, in Chromium and
// WebKit, in lockstep, window by window, in level and in difference; the
// whole mix, and each track alone. Writes hears.json.
//
//   node conformance/songs/hears.mjs
import { writeFileSync } from 'node:fs';
import { buildEngine, npmEngine } from '../cues/render/browser.mjs';
import { PLAYWRIGHT, SCENARIOS, renderSongs } from './render.mjs';
import { db1, rmsDb, underMusic, windowStarts } from './compare.mjs';

const RATE = 48000;
const today = await npmEngine({ npm: 'soundscape-engine', version: '0.4.1' });
const branch = { info: buildEngine(), bundle: undefined };

/** Each track alone, by what the harness solos it by. */
const TRACKS = {
  rps: ['pad', 'bass', 'keys', 'percussion', 'lead', 'glitch', 'glitch-random'],
  fm: ['track001', 'track002', 'track003'],
};
const NAMES = { track001: 'strings', track002: 'bell', track003: 'piano' };

/**
 * Today's render against the branch's, window by window, over both channels:
 * each one's level, the change in level, and how far under today's music the
 * difference sits. Today's reverb draws from Math.random, seeded here, so one
 * draw stands for the many a listener hears.
 */
function compare(old, now) {
  const from = old.meta.playFrame;
  const size = 2 * RATE;
  const windows = windowStarts(old.channels[0].length, RATE, from).map((s, i) => {
    const level = (r) => Math.max(...[0, 1].map((c) => rmsDb(r.channels[c], s, s + size)));
    const under = Math.max(...[0, 1].map((c) => underMusic(old.channels[c], now.channels[c], RATE, from)[i] ?? -Infinity));
    const before = level(old);
    const after = level(now);
    return { from: (s - from) / RATE, todayDbfs: db1(before), branchDbfs: db1(after), changeDb: db1(after - before), underMusicDb: db1(under) };
  });
  const sounding = windows.filter((w) => typeof w.todayDbfs === 'number' && w.todayDbfs > -100);
  const changes = sounding.map((w) => w.changeDb).filter((x) => typeof x === 'number');
  const unders = sounding.map((w) => w.underMusicDb).filter((x) => typeof x === 'number');
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return {
    whole: { todayDbfs: db1(rmsDb(old.channels[0], from)), branchDbfs: db1(rmsDb(now.channels[0], from)), changeDb: db1(rmsDb(now.channels[0], from) - rmsDb(old.channels[0], from)) },
    largestWindowChangeDb: db1(changes.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0)),
    worstWindowUnderMusicDb: db1(Math.max(...unders)),
    medianWindowUnderMusicDb: db1(median(unders)),
    windows,
  };
}

const out = {
  about:
    "What each game hears change from today's engine, 0.4.1 from npm, to the engine built from this checkout: in Chromium and WebKit, in lockstep, as SCENARIOS in render.mjs plays each game, with the reverb and the compressor in. The whole mix; the mix again with the reverb left out on both, to tell a change of reverb draw from the rest; then each track alone, soloed. Per 2 s window: each engine's level, the change, and how far under today's music the difference sits. Today's reverb draws from Math.random, seeded with 1 here, so one draw stands for the many a listener hears on different loads. Windows quieter than -100 dBFS are left out of the summaries.",
  today: today.info,
  branch: branch.info,
  playwright: PLAYWRIGHT,
  browsers: {},
  games: {},
};
for (const game of Object.keys(SCENARIOS)) {
  out.games[game] = {};
  for (const browser of ['chromium', 'webkit']) {
    const jobs = [
      { ...SCENARIOS[game], seedReverb: 1 },
      // The same mix with the reverb left out on both, so a change of reverb draw can be told from the rest
      { ...SCENARIOS[game], seedReverb: 1, leaveOut: { reverb: true } },
      ...TRACKS[game].map((t) => ({ ...SCENARIOS[game], seedReverb: 1, solo: t })),
    ];
    const old = await renderSongs(browser, jobs, { bundle: today.bundle });
    const now = await renderSongs(browser, jobs, { bundle: branch.bundle });
    out.browsers[browser] = now.version;
    const tracks = {};
    TRACKS[game].forEach((t, i) => {
      const { windows, ...summary } = compare(old.renders[i + 2], now.renders[i + 2]);
      tracks[NAMES[t] ?? t] = summary;
    });
    out.games[game][browser] = {
      mix: compare(old.renders[0], now.renders[0]),
      mixWithoutReverb: compare(old.renders[1], now.renders[1]),
      tracks,
    };
    const mix = out.games[game][browser].mix;
    console.log(`${game} ${browser}: mix ${mix.whole.changeDb} dB overall, largest window change ${mix.largestWindowChangeDb} dB, difference ${mix.medianWindowUnderMusicDb} dB under the music (median), ${mix.worstWindowUnderMusicDb} at worst`);
    const dry = out.games[game][browser].mixWithoutReverb;
    console.log(`   without the reverb: ${dry.whole.changeDb} dB overall, largest window change ${dry.largestWindowChangeDb} dB`);
    for (const [name, t] of Object.entries(tracks)) console.log(`   ${name}: ${t.whole.changeDb} dB overall, largest window ${t.largestWindowChangeDb} dB, median ${t.medianWindowUnderMusicDb} under, worst ${t.worstWindowUnderMusicDb}`);
  }
}
writeFileSync(new URL('hears.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
