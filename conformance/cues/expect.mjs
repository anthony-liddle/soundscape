// Runs the engine's parseCueDocument on every case and records what it
// returns, or checks that what is recorded is still what it returns.
//
//   node conformance/cues/expect.mjs --write    rewrite expected.json and numbers.json
//   node conformance/cues/expect.mjs --check    exit 1 if either is out of date
//
// expected.json holds, for each case, `{ "ok": true }` or the whole ordered
// list of problems. A text that is not JSON is recorded with the message
// "is not valid JSON" alone: what follows it is the JavaScript engine's own
// JSON.parse wording, which differs between engines and Node releases, so
// both suites compare only the path "" and that prefix.
//
// numbers.json holds every number literal in every case JSON.parse accepts,
// with the bits of the double JavaScript reads and the way String() writes it
// back, so the Swift reader is proven on each one.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseCueDocument } from './engine.mjs';

const { values } = parseArgs({ options: { write: { type: 'boolean' }, check: { type: 'boolean' } } });
if (values.write === values.check) throw new Error('pass exactly one of --write and --check');

const here = new URL('./', import.meta.url);
const NOT_JSON = 'is not valid JSON';

export function expectedFor(text) {
  const result = parseCueDocument(text);
  if (result.ok) return { ok: true };
  const problems = result.problems.map(({ path, message }) =>
    path === '' && message.startsWith(NOT_JSON) ? { path, message: NOT_JSON } : { path, message },
  );
  return { ok: false, problems };
}

/** Every number literal in the text, by its source, as JSON.parse reads it. */
function numbersIn(text, into) {
  try {
    JSON.parse(text, (_key, value, context) => {
      if (typeof value === 'number') {
        const bits = new DataView(new ArrayBuffer(8));
        bits.setFloat64(0, value);
        into[context.source] = { bits: bits.getBigUint64(0).toString(16).padStart(16, '0'), string: String(value) };
      }
      return value;
    });
  } catch {
    // Not JSON: it has no numbers JavaScript reads
  }
}

const cases = readdirSync(new URL('cases/', here))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length))
  .sort();
const expected = {};
const numbers = {};
for (const name of cases) {
  const text = readFileSync(new URL(`cases/${name}.json`, here), 'utf8');
  expected[name] = expectedFor(text);
  numbersIn(text, numbers);
}
const sortedNumbers = Object.fromEntries(Object.keys(numbers).sort().map((k) => [k, numbers[k]]));
const files = {
  'expected.json': JSON.stringify(expected, null, 2) + '\n',
  'numbers.json': JSON.stringify(sortedNumbers, null, 2) + '\n',
};

if (values.write) {
  for (const [file, content] of Object.entries(files)) writeFileSync(new URL(file, here), content);
  console.log(`wrote ${cases.length} cases and ${Object.keys(numbers).length} numbers`);
} else {
  let stale = false;
  for (const [file, content] of Object.entries(files)) {
    if (readFileSync(new URL(file, here), 'utf8') !== content) {
      console.error(`${file} is out of date: run node conformance/cues/expect.mjs --write, and read the diff`);
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log(`${cases.length} cases and ${Object.keys(numbers).length} numbers are current`);
}
