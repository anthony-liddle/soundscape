# Cue Format Conformance

The shared corpus for the cue format. The TypeScript engine (`packages/engine`) and the Swift library (`swift/`) both run every case, and must give the answer recorded here.

## What Is Here

- **`cases/`:** one JSON text per case, exactly as a reader would be given it. Some are not JSON on purpose.
- **`expected.json`:** for each case, `{ "ok": true }` or the whole ordered list of problems, each a path and a message. It is written by the engine, never by hand.
- **`numbers.json`:** every number literal in every case that is JSON, with the bits of the double JavaScript reads and the way JavaScript writes it back. The Swift reader is held to each one.
- **`exceptions.json`:** every place the two languages cannot agree exactly, and why.
- **`engine.mjs`:** loads the engine's `parseCueDocument` straight from its TypeScript source.
- **`expect.mjs`:** writes `expected.json` and `numbers.json`, or checks they are current.
- **`build-cases.mjs`:** wrote `cases/`.

## The Cases

- **`test-`** (44): the documents `validate.test.ts` builds, the same changes to the same valid document. Its NaN level has no text form (see `exceptions.json`), and its infinite start is written by hand.
- **`hand-`:** numbers JSON can only write as an overflow, `1e400`.
- **`foundation-`:** each place Foundation's JSON readers part from `JSON.parse`, from the Soundscape In Swift discovery: a repeated key, a trailing comma, integer-like names, `1` for `true`, a lone surrogate.
- **`peach-of-a-word`:** Peach of a Word's `src/audio/peach.cues.json` at its commit `442ceb4`, SHA-256 `b66a60d7...445f615f`. Accepted.
- **The rest:** other things a reader can get wrong, each named for what it holds.

## Running It

- **TypeScript:** `pnpm --filter soundscape-engine test run src/cues/__tests__/conformance.test.ts`, also part of the engine's suite.
- **Swift:** `swift test --filter Conformance`, also part of `swift test`.
- **Are the expected results current:** `node conformance/cues/expect.mjs --check`. Both suites fail as well if they are not.
- **After changing the validator or adding a case:** `node conformance/cues/expect.mjs --write`, then read the diff before committing it.
