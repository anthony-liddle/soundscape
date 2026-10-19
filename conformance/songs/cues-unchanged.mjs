// Every cue renders exactly as before: each cue of every reference set, at
// both rates and both starts, in every browser the set records, through
// today's engine, 0.4.1 from npm, which main's source is, and through the
// engine built from this checkout. Writes cues-unchanged.json.
//
//   node conformance/songs/cues-unchanged.mjs
//
// Today's engine renders each condition twice. Where its two renders are
// byte for byte alike for every cue, the branch must render every cue byte for
// byte the same. Where they differ for any cue, the condition races, as
// Peach's does in Chromium and WebKit, whose cues all render in one page and
// are not checked for races: a cue can then come out alike twice by chance.
// Today's engine renders it twice more, and every cue the branch renders must
// stay within that condition's own run-to-run gap, the largest between any
// two of today's four renders of any of its cues, and measure as one of them
// does, to a step. Peach is rendered again with no voice
// ever disconnected, where WebKit renders the same every time.
//
//   node conformance/songs/cues-unchanged.mjs [--set <name>]
//
// --set renders that set again and keeps the rest of cues-unchanged.json.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildEngine, npmEngine, renderInBrowser, PLAYWRIGHT } from '../cues/render/browser.mjs';
import { RATES, SECONDS, SETS, STARTS, cueNames, documentText, optionsFor, recordedBrowsers } from '../cues/render/conditions.mjs';
import { measure } from '../cues/measure/soundMeasure.ts';
import { NO_SPREAD, spreadBetween, toleranceFrom } from '../cues/measure/renderSpread.ts';
import { withinTolerance } from './compare.mjs';

const today = await npmEngine({ npm: 'soundscape-engine', version: '0.4.1' });
const branch = buildEngine();
const sha = (x) => createHash('sha256').update(Buffer.from(x.buffer, x.byteOffset, x.byteLength)).digest('hex');
const gap = (a, b) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
const measured = (x, rate, cue) => measure(x, rate, optionsFor(cue));
/** Two measurements alike to a step: one recording step on every value, nothing gained or lost. */
const aStep = toleranceFrom({ ...NO_SPREAD });
const alike = (m, n) => withinTolerance({ ...spreadBetween(m, n), silentInOne: 0 }, aStep);

const only = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : null;
const file = new URL('cues-unchanged.json', import.meta.url);
const kept = only && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;

const sets = kept ? kept.sets : {};
const versions = kept ? kept.browsers : {};
for (const set of Object.keys(SETS).filter((s) => only === null || s === only)) {
  const cues = cueNames(set);
  const untilTheChainGoes = Boolean(SETS[set].untilTheChainGoes);
  sets[set] = {};
  for (const rate of RATES) {
    for (const [label, start] of Object.entries(STARTS)) {
      for (const browser of recordedBrowsers(set)) {
        const render = (options) => renderInBrowser(browser, documentText(set), cues, rate, start, SECONDS, { untilTheChainGoes, ...options });
        const todays = [await render({ bundle: today.bundle }), await render({ bundle: today.bundle })];
        const after = await render({});
        versions[browser] = after.version;
        const differs = (runs) => cues.some((cue) => runs.some((r) => sha(r.samples[cue]) !== sha(runs[0].samples[cue])));
        // A condition that races is rendered twice more, so its own gap is
        // bounded by four of today's renders, not two
        if (differs(todays)) todays.push(await render({ bundle: today.bundle }), await render({ bundle: today.bundle }));
        const voices = set === 'peach' ? [await render({ bundle: today.bundle, keepVoices: true }), await render({ keepVoices: true })] : null;
        // The condition's own run-to-run gap: the largest between any two of today's renders of any cue
        const pairs = todays.flatMap((a, i) => todays.slice(i + 1).map((b) => [a, b]));
        const noise = Math.max(...cues.flatMap((cue) => pairs.map(([a, b]) => gap(a.samples[cue], b.samples[cue]))));
        const result = { todayRuns: todays.length, todaysOwnGap: noise, cues: {} };
        for (const cue of cues) {
          const c = after.samples[cue];
          const runs = todays.map((r) => r.samples[cue]);
          if (runs.every((a) => sha(a) === sha(c))) {
            result.cues[cue] = sha(c);
          } else if (noise === 0) {
            // Today renders this condition the same every time, so the branch must too
            result.cues[cue] = { today: sha(runs[0]), branch: sha(c), pass: false };
          } else {
            const branchGap = Math.min(...runs.map((a) => gap(a, c)));
            const m = measured(c, rate, cue);
            const measuresAsToday = runs.some((a) => alike(m, measured(a, rate, cue)));
            result.cues[cue] = {
              branchGap,
              measuresAsToday,
              ...(voices && { noVoiceDisconnectedByteForByte: sha(voices[0].samples[cue]) === sha(voices[1].samples[cue]) }),
              pass: branchGap <= noise && measuresAsToday,
            };
          }
        }
        sets[set][`${rate} from ${label} s in ${browser}`] = result;
        const entries = Object.values(result.cues);
        const bytes = entries.filter((e) => typeof e === 'string').length;
        const within = entries.filter((e) => typeof e === 'object' && e.pass).length;
        console.log(`${set} ${rate} from ${label} s in ${browser}: ${bytes} byte for byte, ${within} within its own gap of ${noise.toExponential(2)}, of ${cues.length}`);
      }
    }
  }
}

const totals = { renders: 0, byteForByte: 0, withinTheirOwnGap: 0, failing: 0 };
for (const conditions of Object.values(sets)) {
  for (const { cues } of Object.values(conditions)) {
    for (const entry of Object.values(cues)) {
      totals.renders++;
      if (typeof entry === 'string') totals.byteForByte++;
      else if (entry.pass) totals.withinTheirOwnGap++;
      else totals.failing++;
    }
  }
}
writeFileSync(
  file,
  JSON.stringify(
    {
      about:
        "Each cue of every reference set, at both rates and both starts, in every browser the set records, through today's engine twice, or four times where it races, and the engine built from this checkout once. A string is the SHA-256 of a render's float32 bytes, the same from all three. Where today's own two renders of a condition differ, it is rendered twice more, its todaysOwnGap is the largest between any two of today's four, and each cue that is not byte for byte alike records the branch's gap to the nearest of today's renders, whether it measures as today does to a step, and for Peach whether today and the branch render byte for byte alike with no voice ever disconnected.",
      today: today.info,
      branch,
      playwright: PLAYWRIGHT,
      browsers: versions,
      totals,
      sets,
    },
    null,
    1
  ) + '\n'
);
console.log(JSON.stringify(totals));
