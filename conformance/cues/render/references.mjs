// Renders every reference cue in the browsers and records what measure() reads
// from each render: measurements, never audio. CI does not run this; it reads
// what this wrote. Rerun it on purpose, then read the diff.
//
//   node conformance/cues/render/references.mjs
//   node conformance/cues/render/references.mjs --fixture <Peach's src/audio/baseline/sounds.json>
//   node conformance/cues/render/references.mjs --dump <dir>    also write raw float32, for diffing locally
//
// The engine is built from this checkout's source first. Playwright is the
// engine's own devDependency, with whatever browsers it installed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { measure } from '../measure/soundMeasure.ts';
import { PLAYWRIGHT, buildEngine, renderInBrowser } from './browser.mjs';
import { RATES, SECONDS, SETS, STARTS, cueNames, documentText, fixturePath, optionsFor, referencePath } from './conditions.mjs';

const { values } = parseArgs({ options: { fixture: { type: 'string' }, dump: { type: 'string' } } });

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

const engine = buildEngine();
for (const rate of RATES) {
  for (const [set, { browsers }] of Object.entries(SETS)) {
    const cues = cueNames(set);
    const measured = Object.fromEntries(cues.map((cue) => [cue, {}]));
    const versions = {};
    for (const [label, start] of Object.entries(STARTS)) {
      for (const browser of browsers) {
        const { version, samples } = await renderInBrowser(browser, documentText(set), cues, rate, start, SECONDS);
        versions[browser] = version;
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
    writeLines(
      referencePath(set, rate),
      {
        about: `What measure() reads from each browser's offline render of each cue, at ${rate} Hz, started at each time in starts.`,
        engine,
        playwright: PLAYWRIGHT,
        browsers: versions,
        rate,
        seconds: SECONDS,
        starts: STARTS,
      },
      measured,
    );
    console.log(`${set} at ${rate} Hz: ${cues.length} cues in ${browsers.join(', ')}`);
  }
}
