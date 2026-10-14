// Holds a set of renders to the bar: every reference cue, at every rate and
// start, measured by Peach's own measure() and compared with every reference
// its condition lists. Prints one row per cue and one column per condition,
// each cell the worst gap to any reference and which one, and exits 1 if any
// cue misses.
//
//   node conformance/cues/render/judge.mjs <dir>              <dir>/<set>-<rate>-<start>/<cue>.f32
//   node conformance/cues/render/judge.mjs <dir> --controls   <dir>/controls/<control>/<cue>.f32
//   node conformance/cues/render/judge.mjs <dir> --knockouts  <dir>/knockouts/<knockout>/<set>-<rate>-<start>/<cue>.f32
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
//
// With --knockouts, each feature the filters, LFOs, unison, the delay and
// distortion bring, knocked out in turn: every cue whose instrument has it, at every rate and start,
// must miss the bar. Where the bar is known not to see one, it is named and
// counted, not hidden, and any it does not see elsewhere fails.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { measure } from '../measure/soundMeasure.ts';
import { spreadBetween } from '../measure/renderSpread.ts';
import { SECONDS, STARTS, cueNames, documentText, optionsFor, readFixture, readReferences } from './conditions.mjs';
import { breaks, worstGap } from './rule.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { controls: { type: 'boolean' }, knockouts: { type: 'boolean' }, sets: { type: 'string' } },
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

if (values.knockouts) {
  // The same sets and cues ReferenceRenders.knockouts picks: those whose instrument has the feature
  const FILTERS = ['filters', 'modulation'];
  const EFFECTS = ['delay', 'echo', 'distortion'];
  const KNOCKOUTS = {
    'no-filter': [FILTERS, (i) => i.filterType !== 'none'],
    'linear-lowpass-q': [FILTERS, (i) => i.filterType === 'lowpass'],
    'lfo-rate-doubled': [FILTERS, (i) => i.lfoDepth > 0],
    'unison-half-detune': [FILTERS, (i) => i.unisonDetune > 0],
    'ring-to-level': [FILTERS, (i) => i.filterType !== 'none'],
    'no-extra-quantum': [EFFECTS, (i) => i.delayFeedback > 0 && i.delayMix > 0],
    'no-oversampling': [['distortion'], (i) => i.distortion > 0],
    'oversampling-without-delay': [['distortion'], (i) => i.distortion > 0],
    'distortion-k-doubled': [['distortion'], (i) => i.distortion > 0],
    'mix-on-wet-only': [EFFECTS, (i) => i.delayMix > 0],
  };
  // Where the bar cannot see a knockout. The filters' bar at 44.1 kHz allows
  // 14.52 ms in time, the 640 frames WebKit rings on past Chromium at a
  // bandpass's or notch's least resonance; a ring cut at a level lands within
  // that of Chromium's end on about half the cues. RingEndTests holds every
  // ring to Chromium's last frame instead.
  const BLIND = { 'ring-to-level': ['filters-44100-0', 'filters-44100-8.0027'] };
  let unseen = 0;
  let blind = 0;
  for (const [knockout, [sets, has]] of Object.entries(KNOCKOUTS)) {
    let missed = 0;
    let judged = 0;
    // The miss nearest the bar: the smallest worst gap, in multiples of the bar
    let closest = null;
    for (const set of sets) {
      const document = JSON.parse(documentText(set));
      const cues = Object.keys(document.cues).filter((cue) =>
        document.cues[cue].notes.some((note) => has(document.instruments[note.instrument])),
      );
      for (const [name, condition] of Object.entries(bar.conditions).filter(([, c]) => c.set === set)) {
        for (const cue of cues) {
          const path = `${dir}/knockouts/${knockout}/${name}/${cue}.f32`;
          if (!existsSync(path)) throw new Error(`missing ${path}`);
          const { failures, worst } = judge(path, condition, cue);
          judged++;
          if (failures.length) {
            missed++;
            if (!closest || worst.ratio < closest.ratio) closest = { ...worst, name, cue };
            console.log(`misses   ${knockout.padEnd(26)} ${name.padEnd(22)} ${cue.padEnd(27)} ${failures[0]}`);
          } else if (BLIND[knockout]?.includes(name)) {
            blind++;
            console.log(`blind    ${knockout.padEnd(26)} ${name.padEnd(22)} ${cue.padEnd(27)} worst ${worst.text} against ${worst.against}`);
          } else {
            unseen++;
            console.log(`UNSEEN   ${knockout.padEnd(26)} ${name.padEnd(22)} ${cue.padEnd(27)} worst ${worst.text} against ${worst.against}`);
          }
        }
      }
    }
    const nearest = closest
      ? `, the nearest ${closest.cue} at ${closest.name}: ${closest.text} against ${closest.against}, ${closest.ratio.toFixed(1)} times the bar`
      : '';
    console.log(`${knockout}: ${missed} of ${judged} renders miss the bar${nearest}\n`);
  }
  if (blind) console.log(`${blind} knockout renders within the bar where it is known not to see them`);
  console.log(unseen ? `${unseen} knockout renders the bar should see and does not` : 'every other knockout render misses the bar');
  process.exit(unseen ? 1 : 0);
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
