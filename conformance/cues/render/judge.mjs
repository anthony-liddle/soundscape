// Holds a set of renders to the bar: every reference cue, at every rate and
// start, measured by Peach's own measure() and compared with every reference
// its condition lists. Prints one row per cue and one column per condition,
// each cell the worst gap to any reference and which one, and exits 1 if any
// cue misses.
//
//   node conformance/cues/render/judge.mjs <dir>              <dir>/<set>-<rate>-<start>/<cue>.f32
//   node conformance/cues/render/judge.mjs <dir> --controls   <dir>/controls/<control>/<cue>.f32
//   node conformance/cues/render/judge.mjs <dir> --sets peach,features    only these sets
//
// A browser a condition records beside its references, Firefox for the filters,
// LFOs and unison, is measured against too and shown in the cell, for the
// record; it never fails a render.
//
// A render is float32, little-endian, mono, from the frame on or before the
// cue's start; one shorter than the references' two seconds is read as silent
// after its end.
//
// With --controls, the positive controls: each cue rendered wrong on purpose
// must miss the bar, and 0.05 dB louder must pass, which places the bar's
// resolution.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { measure } from '../measure/soundMeasure.ts';
import { spreadBetween } from '../measure/renderSpread.ts';
import { SECONDS, STARTS, cueNames, optionsFor, readFixture, readReferences } from './conditions.mjs';
import { breaks, worstGap } from './rule.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { controls: { type: 'boolean' }, sets: { type: 'string' } },
});
const [dir] = positionals;
if (!dir) throw new Error('usage: judge.mjs <dir> [--controls]');

const bar = JSON.parse(readFileSync(new URL('bar.json', import.meta.url), 'utf8'));
const fixture = readFixture();
const references = {};
const referencesFor = (set, rate) => (references[`${set}-${rate}`] ??= readReferences(set, rate));

function load(path, rate) {
  const bytes = readFileSync(path);
  const samples = new Float32Array(Math.max(bytes.byteLength / 4, Math.round(rate * SECONDS)));
  samples.set(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  return samples;
}

/** A render against every reference of its condition: its failures, and its worst gap. */
function judge(path, condition, cue) {
  const { set, rate, references: names, bar: tolerance } = condition;
  const start = Object.keys(STARTS).find((k) => STARTS[k] === condition.start);
  const m = measure(load(path, rate), rate, optionsFor(cue));
  const failures = [];
  let worst = { ratio: -1, text: '', against: '' };
  for (const name of names) {
    const reference = name === 'fixture' ? fixture.cues[cue] : referencesFor(set, rate).cues[cue][start][name];
    const spread = spreadBetween(reference, m);
    const broken = breaks(spread, tolerance);
    if (broken.length) failures.push(`${name}: ${broken.join(', ')}`);
    const gap = worstGap(spread, tolerance);
    if (gap.ratio > worst.ratio) worst = { ...gap, against: name };
  }
  // Beside the references, for the record only
  const beside = (condition.recordedBeside ?? []).map((name) => {
    const spread = spreadBetween(referencesFor(set, rate).cues[cue][start][name], m);
    const broken = breaks(spread, tolerance);
    return `${name}: ${broken.length ? `would miss, ${broken.join(', ')}` : worstGap(spread, tolerance).text}`;
  });
  return { failures, worst, beside };
}

if (values.controls) {
  // Each control is rendered at 48 kHz from 0, for the discovery's three cues
  const condition = bar.conditions['peach-48000-0'];
  const CONTROLS = {
    'semitone-sharp': 'miss',
    'cent-sharp': 'miss',
    'wrong-waveform': 'miss',
    'frame-late': 'miss',
    'louder-0.1dB': 'miss',
    'louder-0.05dB': 'pass',
  };
  let wrong = 0;
  for (const [control, want] of Object.entries(CONTROLS)) {
    for (const cue of ['tick', 'found-8-mythic-cute', 'edition']) {
      const path = `${dir}/controls/${control}/${cue}.f32`;
      if (!existsSync(path)) throw new Error(`missing ${path}`);
      const { failures, worst } = judge(path, condition, cue);
      const got = failures.length ? 'miss' : 'pass';
      if (got !== want) wrong++;
      console.log(
        `${got === want ? 'as it should' : 'WRONG'}  ${control.padEnd(15)} ${cue.padEnd(20)} ${got}` +
          (failures.length ? `: ${failures[0]}` : `, worst ${worst.text} against ${worst.against}`),
      );
    }
  }
  console.log(wrong ? `${wrong} controls came out wrong` : 'every control came out as it should');
  process.exit(wrong ? 1 : 0);
}

const chosen = values.sets?.split(',');
const columns = Object.entries(bar.conditions).filter(([, c]) => !chosen || chosen.includes(c.set));
const sets = [...new Set(columns.map(([, c]) => c.set))];
let misses = 0;
let cells = 0;
const header = ['cue', ...[...new Set(columns.map(([, c]) => `${c.rate / 1000} kHz from ${Object.keys(STARTS).find((k) => STARTS[k] === c.start)} s`))]];
console.log(`| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|`);
for (const set of sets) {
  for (const cue of cueNames(set)) {
    const row = [cue];
    for (const [name, condition] of columns.filter(([, c]) => c.set === set)) {
      const path = `${dir}/${name}/${cue}.f32`;
      if (!existsSync(path)) throw new Error(`missing ${path}`);
      const { failures, worst, beside } = judge(path, condition, cue);
      cells++;
      const record = beside.length ? ` (${beside.join('; ')})` : '';
      if (failures.length) {
        misses++;
        row.push(`**MISS** ${failures.join('; ')}${record}`);
      } else {
        row.push(`${worst.text}, ${worst.against}${record}`);
      }
    }
    console.log(`| ${row.join(' | ')} |`);
  }
}
console.log(`\n${cells - misses} of ${cells} renders within the bar${misses ? `, ${misses} missed` : ''}`);
process.exit(misses ? 1 : 0);
