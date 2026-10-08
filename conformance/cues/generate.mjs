// Seeded random mutations of valid cue documents, each with the engine's
// answer, for the Swift validator to be held to. This is where the two
// languages meet: the engine answers here, in JavaScript, and writes each text
// and its answer as one line of JSON; the Swift suite reads the file, runs
// every text through its own validator and compares.
//
//   node conformance/cues/generate.mjs --seed 1 --count 3000 --out .build/generated.jsonl
//   CUE_GENERATED=.build/generated.jsonl swift test --filter GeneratedTests
//
// Each case has a seed of its own, made from the run's seed and its index, so
// one case can be made again alone: --seed 1 --only 1234. When the two
// disagree, the Swift suite prints that command. Once the disagreement is
// fixed, the case belongs in the corpus: copy its text into cases/ and run
// expect.mjs --write.
//
// The mutations, one to three per case, on a document held as ordered member
// lists, so a key can appear twice and a number keeps the exact text it is
// written with:
//   delete      a key, anywhere
//   swap        a value for one of another type
//   repeat      a key in its object, sometimes with its name escaped
//   integer     an integer-like name for a member, or a new member under one
//   boundary    a number for one at or across a limit the validator draws
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { answerFor } from './engine.mjs';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    count: { type: 'string', default: '1000' },
    only: { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.out) throw new Error('--out <file> is required');
const SEED = Number(values.seed);

/** mulberry32: small, fast and the same everywhere. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A case's own seed, from the run's seed and its index. */
const caseSeed = (index) => (Math.imul(SEED, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca77)) >>> 0;

// A document as a tree that can hold what a JavaScript object cannot: a
// repeated key, and a number's own text.
const num = (src) => ({ t: 'num', src });
const str = (v) => ({ t: 'str', v });
const lit = (v) => ({ t: 'lit', v });
const arr = (items) => ({ t: 'arr', items });
const obj = (members) => ({ t: 'obj', members });
const member = (key, value, escaped = false) => ({ key, value, escaped });

function fromValue(v) {
  if (v === null || typeof v === 'boolean') return lit(String(v));
  if (typeof v === 'number') return num(JSON.stringify(v));
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) return arr(v.map(fromValue));
  return obj(Object.entries(v).map(([k, x]) => member(k, fromValue(x))));
}

const clone = (node) => structuredClone(node);

function escapeKey(key) {
  return '"' + [...key].map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '"';
}

function emit(node, pretty, depth = 0) {
  const pad = pretty ? '\n' + '  '.repeat(depth + 1) : '';
  const end = pretty ? '\n' + '  '.repeat(depth) : '';
  switch (node.t) {
    case 'num':
      return node.src;
    case 'str':
      return JSON.stringify(node.v);
    case 'lit':
      return node.v;
    case 'arr':
      if (node.items.length === 0) return '[]';
      return '[' + node.items.map((x) => pad + emit(x, pretty, depth + 1)).join(',') + end + ']';
    case 'obj':
      if (node.members.length === 0) return '{}';
      return (
        '{' +
        node.members
          .map((m) => pad + (m.escaped ? escapeKey(m.key) : JSON.stringify(m.key)) + (pretty ? ': ' : ':') + emit(m.value, pretty, depth + 1))
          .join(',') +
        end +
        '}'
      );
  }
}

const instrument = (changes) => ({
  waveform: 'square',
  pitchOffset: 0,
  attack: 0.07418049,
  decay: 0.05172575,
  sustain: 0,
  release: 0,
  envelopeCurve: 'exponential',
  envelopeFloor: 0.000018,
  filterType: 'none',
  filterCutoff: 1,
  filterResonance: 0,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  reverbMix: 0,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  unisonDetune: 0,
  velocityResponse: 0,
  ...changes,
});
const note = (id, inst, start, duration, pitch, level) => ({ id, instrument: inst, start, duration, pitch, level });

/** The valid documents every case starts from. */
const BASES = [
  {
    format: 'soundscape-cues',
    version: 1,
    instruments: { square: instrument({}) },
    cues: { tick: { notes: [note('tick-1', 'square', 0, 0.03, 81, 0.0216)] } },
  },
  {
    format: 'soundscape-cues',
    version: 1,
    instruments: {
      sine: (() => {
        const i = instrument({ waveform: 'sine', decayUntilRelease: true });
        delete i.decay;
        return i;
      })(),
      keys: (() => {
        const i = instrument({ waveform: 'triangle', envelopeCurve: 'linear', sustain: 0.4, release: 0.2, filterType: 'lowpass', filterCutoff: 0.6, lfoTarget: 'filter', lfoDepth: 0.2, lfoRate: 0.5 });
        delete i.envelopeFloor;
        return i;
      })(),
    },
    cues: {
      found: { notes: [note('found-1', 'sine', 0, 0.28, 78.99998074500876, 0.162), note('found-2', 'sine', 0.04, 0.12, 98.01953075366262, 0.018)] },
      chord: { notes: [note('chord-1', 'keys', 0, 0.5, 72, 0.15), note('chord-2', 'keys', 0.1, 0.5, 76, 0.15)] },
      quiet: { notes: [] },
    },
  },
].map(fromValue);

const BOUNDARIES = [
  '0', '-0', '1', '-1', '0.5', '2', '24', '-24', '24.000000000000004', '25', '-25', '127', '127.00000000000001',
  '128', '1e400', '-1e400', '1e-400', '5e-324', '0.000018', '1.8e-5', '0.0000179999', '0.000018000000000000002',
  '1.7976931348623157e308', '9007199254740993', '1E0', '1e0', '0.0', '1.0', '1.00', '0.30000000000000004', '1e21',
  '1e-7', '0.9999999999999999', '1.0000000000000002', '-0.0', '3e-2',
];
const STRINGS = ['', 'x', '0', '1', 'square', 'sine', 'keys', 'tick', 'tick-1', 'found-1', 'true', 'two words', '_x', '-x', '\ud800', 'é', 'soundscape-cues', 'exponential', 'linear', 'none', 'filter', 'pitch', 'noise', 'toString', '__proto__'];
const INTEGER_NAMES = ['0', '1', '2', '10', '007', '00', '4294967294', '4294967295', '-1', '1.5', '1e3'];

/** Every node in the tree, with its parent and how to replace it. */
function nodes(root) {
  const out = [];
  const walk = (node, set) => {
    out.push({ node, set });
    if (node.t === 'arr') node.items.forEach((x, i) => walk(x, (v) => (node.items[i] = v)));
    if (node.t === 'obj') node.members.forEach((m) => walk(m.value, (v) => (m.value = v)));
  };
  walk(root, () => {});
  return out;
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function randomValue(rand, avoid) {
  const kinds = ['num', 'str', 'lit', 'arr', 'obj'].filter((k) => k !== avoid);
  switch (pick(rand, kinds)) {
    case 'num':
      return num(pick(rand, BOUNDARIES));
    case 'str':
      return str(pick(rand, STRINGS));
    case 'lit':
      return lit(pick(rand, ['true', 'false', 'null']));
    case 'arr':
      return rand() < 0.5 ? arr([]) : arr([num(pick(rand, BOUNDARIES)), str(pick(rand, STRINGS))]);
    case 'obj':
      return rand() < 0.5 ? obj([]) : obj([member(pick(rand, STRINGS), num(pick(rand, BOUNDARIES)))]);
  }
}

const MUTATIONS = {
  delete(rand, root) {
    const objects = nodes(root).map((n) => n.node).filter((n) => n.t === 'obj' && n.members.length > 0);
    if (objects.length === 0) return false;
    const o = pick(rand, objects);
    o.members.splice(Math.floor(rand() * o.members.length), 1);
    return true;
  },
  swap(rand, root) {
    const all = nodes(root).slice(1);
    const { node, set } = pick(rand, all);
    set(randomValue(rand, node.t));
    return true;
  },
  repeat(rand, root) {
    const objects = nodes(root).map((n) => n.node).filter((n) => n.t === 'obj' && n.members.length > 0);
    if (objects.length === 0) return false;
    const o = pick(rand, objects);
    const i = Math.floor(rand() * o.members.length);
    const original = o.members[i];
    const value = rand() < 0.5 ? clone(original.value) : randomValue(rand, null);
    const at = i + 1 + Math.floor(rand() * (o.members.length - i));
    o.members.splice(at, 0, member(original.key, value, rand() < 0.3));
    return true;
  },
  integer(rand, root) {
    const objects = nodes(root).map((n) => n.node).filter((n) => n.t === 'obj' && n.members.length > 0);
    if (objects.length === 0) return false;
    const o = pick(rand, objects);
    const name = pick(rand, INTEGER_NAMES);
    if (rand() < 0.5) {
      pick(rand, o.members).key = name;
    } else {
      const copy = clone(pick(rand, o.members).value);
      o.members.splice(Math.floor(rand() * (o.members.length + 1)), 0, member(name, copy));
    }
    return true;
  },
  boundary(rand, root) {
    const numbers = nodes(root).filter((n) => n.node.t === 'num');
    if (numbers.length === 0) return false;
    pick(rand, numbers).node.src = pick(rand, BOUNDARIES);
    return true;
  },
};

export function makeCase(index) {
  const rand = random(caseSeed(index));
  const root = clone(pick(rand, BASES));
  const applied = [];
  const count = 1 + Math.floor(rand() * 3);
  while (applied.length < count) {
    const name = pick(rand, Object.keys(MUTATIONS));
    if (MUTATIONS[name](rand, root)) applied.push(name);
  }
  const text = emit(root, rand() < 0.5) + (rand() < 0.5 ? '\n' : '');
  return { seed: SEED, index, mutations: applied, text, expected: answerFor(text) };
}

const indices = values.only !== undefined ? [Number(values.only)] : [...Array(Number(values.count)).keys()];
const lines = indices.map((i) => JSON.stringify(makeCase(i)));
writeFileSync(values.out, lines.join('\n') + '\n');
const cases = lines.map((l) => JSON.parse(l));
const ok = cases.filter((c) => c.expected.ok).length;
const notJson = cases.filter((c) => !c.expected.ok && c.expected.problems[0].message === 'is not valid JSON').length;
console.log(`seed ${SEED}: ${cases.length} cases to ${values.out}, ${ok} accepted, ${notJson} not JSON, ${cases.length - ok - notJson} with problems`);
