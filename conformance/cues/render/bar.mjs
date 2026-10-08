// Writes the bar: for each set of cues, at each rate and start, how far a
// render may sit from each reference, by Peach's fixture rule applied to how
// far the references sit from each other. Then proves the feature references
// can see their features: each feature knocked out must fail its bar.
//
//   node conformance/cues/render/bar.mjs
//
// Needs the browsers for the knockouts; CI only reads bar.json.
import { writeFileSync } from 'node:fs';
import { measure } from '../measure/soundMeasure.ts';
import { NO_SPREAD, spreadBetween, toleranceFrom, widest } from '../measure/renderSpread.ts';
import { buildEngine, renderInBrowser } from './browser.mjs';
import { RATES, SECONDS, SETS, STARTS, documentText, readFixture, readReferences } from './conditions.mjs';
import { breaks } from './rule.mjs';

/**
 * The discovery's bar for Peach's cues at 48 kHz, BAR.md in the Soundscape In
 * Swift report's assets, fixed before any Swift render existed. Recomputed
 * here from this checkout's references, and required to agree.
 */
const DISCOVERY_BAR = { seconds: 0.00001, db: 0.09, hz: 0.01, partialHz: 0.02, partialDb: 0.02 };

const conditions = {};
for (const [set, { browsers }] of Object.entries(SETS)) {
  for (const rate of RATES) {
    const references = readReferences(set, rate);
    for (const start of Object.keys(STARTS)) {
      let spread = { ...NO_SPREAD };
      for (const byStart of Object.values(references.cues)) {
        for (let i = 0; i < browsers.length; i++)
          for (let j = i + 1; j < browsers.length; j++)
            spread = widest(spread, spreadBetween(byStart[start][browsers[i]], byStart[start][browsers[j]]));
      }
      const computed = toleranceFrom(spread);
      // The fixture is a 48 kHz render from 0, which a 48 kHz render from 8.0027 s,
      // 3001 render quanta later, also is
      const withFixture = set === 'peach' && rate === 48000;
      let bar = computed;
      if (withFixture) {
        if (JSON.stringify(computed) !== JSON.stringify(DISCOVERY_BAR))
          throw new Error(`peach at 48 kHz from ${start}: computed ${JSON.stringify(computed)}, the discovery's bar is ${JSON.stringify(DISCOVERY_BAR)}`);
        bar = DISCOVERY_BAR;
      }
      conditions[`${set}-${rate}-${start}`] = {
        set,
        rate,
        start: STARTS[start],
        references: withFixture ? [...browsers, 'fixture'] : browsers,
        spread,
        bar,
      };
    }
  }
}

// Each feature knocked out, rendered in Chromium at 48 kHz from 0: each must
// fail its own cue's bar against Chromium and WebKit, or the reference cannot
// see the feature it is for.
const KNOCKOUTS = {
  sawtooth: ['saw', { waveform: 'square' }, 'square for sawtooth'],
  'linear-envelope': ['linear', { envelopeCurve: 'exponential', envelopeFloor: 0.000018 }, 'exponential for linear'],
  'fixed-decay-sustain': ['held', { sustain: 0 }, 'sustain 0'],
  release: ['ring', { release: 0 }, 'release 0'],
  'pitch-offset': ['offset', { pitchOffset: 0 }, 'pitch offset 0'],
};
const engine = buildEngine();
const knockouts = {};
const features = readReferences('features', 48000);
const featureBar = conditions['features-48000-0'].bar;
for (const [cue, [instrument, change, what]] of Object.entries(KNOCKOUTS)) {
  const doc = JSON.parse(documentText('features'));
  Object.assign(doc.instruments[instrument], change);
  const { samples } = await renderInBrowser('chromium', JSON.stringify(doc), [cue], 48000, 0, SECONDS);
  const m = measure(samples[cue], 48000);
  const failures = SETS.features.browsers.map((b) => [b, breaks(spreadBetween(features.cues[cue]['0'][b], m), featureBar)]);
  knockouts[cue] = { change: what, failsAgainst: Object.fromEntries(failures) };
  if (failures.some(([, f]) => f.length === 0)) throw new Error(`${cue} with ${what} passes its bar: the reference cannot see it`);
  console.log(`${cue}, ${what}: fails, ${failures.map(([b, f]) => `${b}: ${f.join(', ')}`).join('; ')}`);
}

const fixture = readFixture();
writeFileSync(
  new URL('bar.json', import.meta.url),
  JSON.stringify(
    {
      about:
        "How far a Swift render may sit from each reference. For each set, rate and start, the widest spread between the references' measurements, rounded up to the step each value is recorded to, plus one step: Peach's fixture rule. A render passes when, against every reference listed, every gap is within the bar and no partial is gained, lost or made strongest.",
      engine,
      fixture: { source: fixture.source, sha256: fixture.sha256 },
      conditions,
      knockouts,
    },
    null,
    2,
  ) + '\n',
);
for (const [name, c] of Object.entries(conditions)) console.log(name.padEnd(22), JSON.stringify(c.bar));
