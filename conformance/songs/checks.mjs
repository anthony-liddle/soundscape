// The four problems the songs discovery found, checked against the engine
// built from this checkout. Writes checks.json, so each commit records which
// it has and by how much.
//
//   node conformance/songs/checks.mjs
import { writeFileSync } from 'node:fs';
import { buildEngine } from '../cues/render/browser.mjs';
import { PLAYWRIGHT, SCENARIOS, renderSongs } from './render.mjs';
import { RULE, db1, measureWindows, meetsRule, spreadOf } from './compare.mjs';


const engine = buildEngine();
const browsers = {};
const checks = {};

/**
 * Two renders by the bar's first rule, over both channels: whether every
 * window meets it, and the worst window that the music still sounds in,
 * leaving out any whose difference is under the floor.
 */
function ruleOf(a, b, rate, from) {
  const judged = [0, 1].map((c) => meetsRule(a.channels[c], b.channels[c], rate, from));
  const all = judged.flatMap((j) => j.windows.filter((w) => w.under !== null).map((w) => w.under));
  const counted = judged.flatMap((j) => j.windows.filter((w) => w.under !== null && !(w.level <= RULE.floorDbfs)).map((w) => w.under));
  const most = (xs) => (xs.length ? Math.max(...xs) : -Infinity);
  return { pass: judged.every((j) => j.pass), worst: most(all), worstSounding: most(counted) };
}

// 1. Two loads of The Forgetting Machine, each drawing its own reverb as a
// browser does: the same music, or not
checks.loads = { about: 'Two loads of The Forgetting Machine, each with the reverb a load of the engine draws.' };
for (const browser of ['chromium', 'webkit']) {
  const job = { ...SCENARIOS.fm, seedReverb: null };
  const { version, renders } = await renderSongs(browser, [job, job]);
  browsers[browser] = version;
  const [a, b] = renders;
  const rule = ruleOf(a, b, 48000, a.meta.playFrame);
  const ids = Object.keys(a.meta.impulses);
  checks.loads[browser] = {
    worstWindowUnderMusicDb: db1(rule.worst),
    worstWindowAboveTheFloorDb: db1(rule.worstSounding),
    impulsesTheSameEachLoad: ids.every((id) => a.meta.impulses[id] === b.meta.impulses[id]),
    impulsesDifferentEachTrack: new Set(ids.map((id) => a.meta.impulses[id])).size === ids.length,
    pass: rule.pass,
  };
}

// 2. Chromium against WebKit, on one impulse response, for both games
checks.browsers = { about: 'Chromium against WebKit, both games as the references play them, on one impulse response. Firefox beside them, for the record.' };
const rendered = {};
for (const browser of ['chromium', 'webkit', 'firefox']) {
  const { version, renders } = await renderSongs(browser, [SCENARIOS.rps, SCENARIOS.fm].map((s) => ({ ...s, seedReverb: 1 })));
  browsers[browser] = version;
  rendered[browser] = { rps: renders[0], fm: renders[1] };
}
for (const game of ['rps', 'fm']) {
  const [c, w, f] = ['chromium', 'webkit', 'firefox'].map((b) => rendered[b][game]);
  const from = c.meta.playFrame;
  const spread = [0, 1]
    .map((ch) => spreadOf(measureWindows(c.channels[ch], 48000, from), measureWindows(w.channels[ch], 48000, from)))
    .reduce((p, q) => Object.fromEntries(Object.keys(p).map((k) => [k, Math.max(p[k], q[k])])));
  const cw = ruleOf(c, w, 48000, from);
  checks.browsers[game] = {
    chromiumWebkitWorstWindowUnderMusicDb: db1(cw.worst),
    chromiumWebkitWorstWindowAboveTheFloorDb: db1(cw.worstSounding),
    chromiumWebkitMeasureSpread: spread,
    chromiumFirefoxWorstWindowUnderMusicDb: db1(ruleOf(c, f, 48000, from).worst),
    pass: cw.pass,
  };
}

// 3. A held note, alone: its level just after noteOff is called, against just
// before. A release that holds until its time moves it by nothing.
checks.held = {
  about:
    'One sine held at 0.6 of its peak: its level after the scheduler calls noteOff, up to 100 ms before the release, against its level just before the call. Reverb and compressor left out, to read the envelope as it is.',
};
for (const browser of ['chromium', 'webkit', 'firefox']) {
  const { renders } = await renderSongs(browser, [{ game: 'held', seconds: 3.2, playAt: 0.128, leaveOut: { reverb: true, compressor: true } }]);
  const [{ channels, meta }] = renders;
  const note = meta.notes[0];
  const x = channels[0];
  const peak = (from, to) => {
    let p = 0;
    for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]));
    return p;
  };
  const release = Math.round(note.off * 48000);
  const before = peak(note.offAt - 1536, note.offAt - 256);
  const after = peak(note.offAt + 256, release - 256);
  const step = 20 * Math.log10(after / before);
  checks.held[browser] = {
    noteOffCalledMsBeforeRelease: Math.round(((release - note.offAt) / 48000) * 10000) / 10,
    stepDb: Math.round(step * 100) / 100,
    pass: Math.abs(step) < 0.05,
  };
}

// 4. A NaN attack on The Forgetting Machine's strings: handed in with the
// song, and slipped in after updateState has it, as a host changing its own
// state would
checks.nan = { about: "A NaN attack on The Forgetting Machine's strings, track001, in Chromium." };
{
  const handedIn = { ...SCENARIOS.fm, seedReverb: 1, overrides: { track001: { attack: 'NaN' } } };
  const slippedIn = { ...SCENARIOS.fm, seedReverb: 1, corrupt: { track001: { attack: 'NaN' } } };
  const { renders } = await renderSongs('chromium', [handedIn, slippedIn]);
  const [a, b] = renders;
  const first = a.meta.thrown[0];
  checks.nan.handedIn = {
    firstError: first ? first.error : null,
    errors: a.meta.thrown.length,
    notesPlayed: a.meta.played,
    // Refused with a message that says where, before anything plays
    pass: Boolean(first && first.frame === a.meta.playFrame && /track001/.test(first.error) && /attack/.test(first.error) && a.meta.notes.length === 0),
  };
  checks.nan.slippedIn = {
    errors: b.meta.thrown.length + b.meta.reported.length,
    firstError: (b.meta.thrown[0] ?? b.meta.reported[0])?.error ?? null,
    notesPlayed: b.meta.played,
    // The strings fail; the bell and piano play every note
    pass: b.meta.played.track002 === 20 && b.meta.played.track003 === 6,
  };
}

const result = {
  about:
    'The four problems the songs discovery found, on the engine built from this checkout: two loads differing by the reverb; Chromium and WebKit differing by more than the bar; a held note stepping down when noteOff is called; and a NaN override silencing its track and costing the others notes. pass is each check the fixed engine should meet.',
  engine,
  playwright: PLAYWRIGHT,
  browsers,
  checks,
};
writeFileSync(new URL('checks.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
for (const [name, check] of Object.entries(checks)) {
  for (const [k, v] of Object.entries(check)) if (k !== 'about') console.log(`${name} ${k}: ${v.pass ? 'pass' : 'FAIL'} ${JSON.stringify(v).slice(0, 260)}`);
}
