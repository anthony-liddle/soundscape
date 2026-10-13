// Renders every reference cue in the browsers and records what measure() reads
// from each render: measurements, never audio. CI does not run this; it reads
// what this wrote. Rerun it on purpose, then read the diff.
//
//   node conformance/cues/render/references.mjs
//   node conformance/cues/render/references.mjs --fixture <Peach's src/audio/baseline/sounds.json>
//   node conformance/cues/render/references.mjs --dump <dir>    also write raw float32, for diffing locally
//   node conformance/cues/render/references.mjs --set filters --set modulation    only these sets
//
// A set names the engine it is made with, in conditions.mjs: a published one,
// fetched from npm with its integrity checked, or else the engine built from
// this checkout's source first. Playwright is the engine's own devDependency,
// with whatever browsers it installed.
//
// A set made with a published engine is also rendered a second time, and once
// more with no voice ever disconnected, in every browser; each must come out
// the same, sample for sample, or no reference is written. Its file records,
// besides the measurements, the frame each render last sounds on.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { measure } from '../measure/soundMeasure.ts';
import { PLAYWRIGHT, buildEngine, npmEngine, renderInBrowser } from './browser.mjs';
import { RATES, SECONDS, SETS, STARTS, cueNames, documentText, fixturePath, optionsFor, recordedBrowsers, referencePath } from './conditions.mjs';

const { values } = parseArgs({
  options: { fixture: { type: 'string' }, dump: { type: 'string' }, set: { type: 'string', multiple: true } },
});
const sets = values.set ?? Object.keys(SETS);
for (const set of sets) if (!SETS[set]) throw new Error(`no set named ${set}`);

/** One measurement per line, so a rerun's diff shows which cue moved. */
function writeLines(path, head, cues) {
  const lines = Object.entries(cues).map(([cue, m]) => `    ${JSON.stringify(cue)}: ${JSON.stringify(m)}`);
  const top = JSON.stringify(head, null, 2).slice(0, -2);
  writeFileSync(path, `${top},\n  "cues": {\n${lines.join(',\n')}\n  }\n}\n`);
}

if (values.fixture) {
  // Peach's frozen baseline: Chrome 154, 48 kHz, its old engine, which the
  // cues match within 6.0e-8. Its measurements, without its WAV bookkeeping.
  const text = readFileSync(values.fixture);
  const fixture = JSON.parse(text);
  const sounds = {};
  for (const [cue, entry] of Object.entries(fixture.sounds)) {
    const { label, cue: _cue, params, wav, samples, bytes, sha256, ...m } = entry;
    sounds[cue] = m;
  }
  writeLines(
    fixturePath,
    {
      about: "Peach of a Word's frozen sound baseline, measurements only, as measure() recorded them from Chrome 154.",
      source: 'anthony-liddle/peach-of-a-word src/audio/baseline/sounds.json at 442ceb43282ddc96b7333cf428f917cabb2682ba',
      sha256: createHash('sha256').update(text).digest('hex'),
      captured: fixture.captured,
      renderer: fixture.renderer,
    },
    sounds,
  );
  console.log(`fixture: ${Object.keys(sounds).length} sounds`);
}

/** The engine a set is made with: built from source once, or each published one fetched once. */
let built = null;
const published = {};
async function engineFor(set) {
  const spec = SETS[set].engine;
  if (!spec) return (built ??= { info: buildEngine(), bundle: undefined });
  return (published[`${spec.npm}@${spec.version}`] ??= await npmEngine(spec));
}

const bytesOf = (x) => Buffer.from(x.buffer, x.byteOffset, x.byteLength);
const same = (a, b) => a.length === b.length && Buffer.compare(bytesOf(a), bytesOf(b)) === 0;
const lastSounding = (x) => {
  let k = x.length - 1;
  while (k >= 0 && x[k] === 0) k--;
  return k;
};

for (const rate of RATES) {
  for (const set of sets) {
    const browsers = recordedBrowsers(set);
    const { info: engine, bundle } = await engineFor(set);
    const checked = Boolean(SETS[set].engine);
    const cues = cueNames(set);
    const measured = Object.fromEntries(cues.map((cue) => [cue, {}]));
    const lastSound = Object.fromEntries(cues.map((cue) => [cue, {}]));
    const versions = {};
    for (const [label, start] of Object.entries(STARTS)) {
      for (const browser of browsers) {
        const render = (options) => renderInBrowser(browser, documentText(set), cues, rate, start, SECONDS, { bundle, ...options });
        const { version, samples } = await render();
        versions[browser] = version;
        if (checked) {
          const again = (await render()).samples;
          const kept = (await render({ keepVoices: true })).samples;
          for (const cue of cues) {
            const where = `${set} ${cue} at ${rate} Hz from ${label} s in ${browser}`;
            if (!same(samples[cue], again[cue])) throw new Error(`${where} rendered differently twice`);
            if (!same(samples[cue], kept[cue])) throw new Error(`${where}: the engine's own disposal of a voice changed the render`);
            (lastSound[cue][label] ??= {})[browser] = lastSounding(samples[cue]);
          }
        }
        for (const cue of cues) {
          (measured[cue][label] ??= {})[browser] = measure(samples[cue], rate, optionsFor(cue));
          if (values.dump) {
            const dir = `${values.dump}/${set}-${rate}-${label}/${browser}`;
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}/${cue}.f32`, samples[cue]);
          }
        }
      }
    }
    const head = {
      about: `What measure() reads from each browser's offline render of each cue, at ${rate} Hz, started at each time in starts.`,
      engine,
      playwright: PLAYWRIGHT,
      browsers: versions,
      rate,
      seconds: SECONDS,
      starts: STARTS,
    };
    if (checked) {
      Object.assign(head, {
        heldTo: SETS[set].browsers,
        recordedOnly: browsers.filter((b) => !SETS[set].browsers.includes(b)),
        checks:
          'Every render here came out the same twice, and the same again with no voice ever disconnected, so neither a race nor the engine cutting a voice short is in it.',
        lastSound: 'The frame each render last sounds on, from the frame on or before its start, by cue, start and browser.',
        lastSoundFrames: lastSound,
      });
    }
    writeLines(referencePath(set, rate), head, measured);
    console.log(`${set} at ${rate} Hz: ${cues.length} cues in ${browsers.join(', ')}`);
  }
}
