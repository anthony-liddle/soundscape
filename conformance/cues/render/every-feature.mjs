// Writes examples/cues/every-feature.cues.json: every feature cue the Swift
// renderer is held to, in one document, for hearing them side by side on a
// phone, in Cue Check and in Safari. It is the six reference documents
// merged, in the order the references list them, every instrument and cue as
// it is there; their names do not collide. CueCheckTests holds the file to
// that merge, so rerun this after a reference document changes:
//
//   node conformance/cues/render/every-feature.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { SETS } from './conditions.mjs';

const merged = { format: 'soundscape-cues', version: 1, instruments: {}, cues: {} };
for (const set of Object.keys(SETS).filter((set) => set !== 'peach')) {
  const document = JSON.parse(readFileSync(SETS[set].document, 'utf8'));
  for (const kind of ['instruments', 'cues']) {
    for (const [name, value] of Object.entries(document[kind])) {
      if (name in merged[kind]) throw new Error(`${set} repeats ${kind} ${name}`);
      merged[kind][name] = value;
    }
  }
}
const out = new URL('../../../examples/cues/every-feature.cues.json', import.meta.url);
writeFileSync(out, JSON.stringify(merged, null, 2) + '\n');
console.log(`wrote examples/cues/every-feature.cues.json: ${Object.keys(merged.cues).length} cues`);
