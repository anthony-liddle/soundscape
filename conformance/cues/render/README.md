# Render Conformance

What a Swift render of a cue is held to. The browsers' renders are recorded as measurements, never audio, by Peach of a Word's own `measure()` (`../measure/`), and a Swift render passes when `measure()` reads it within the bar of every reference.

## The References

`references.mjs` builds the engine from this checkout, renders every cue offline in Playwright's browsers, and writes what `measure()` reads from each render. CI does not run it. Rerun it on purpose, then read the diff.

- **`references/peach-<rate>.json`:** Peach of a Word's 34 cues, from `../cases/peach-of-a-word.json`, in Chromium, Firefox and WebKit.
- **`references/features-<rate>.json`:** `features.cues.json`, one cue per oscillator and envelope feature Peach does not use, in Chromium and WebKit:
  - **`sawtooth`;**
  - **`linear-envelope`:** a linear envelope, three notes released in the attack, in the decay, and after holding the sustain;
  - **`fixed-decay-sustain`:** the same three, exponential, with a fixed decay;
  - **`release`:** a release of 459 ms;
  - **`pitch-offset`:** an offset of -12.5 semitones.

  Each note sits where `measure()`'s fixed envelope points and spectrum windows land on it.
- **`references/fixture-chrome-154.json`:** Peach's frozen baseline, Chrome 154 at 48 kHz, its measurements only. `--fixture <path to Peach's sounds.json>` rewrites it.
- **Both rates,** 48 and 44.1 kHz, because the player pass decides which one cues render at.
- **Both starts:** 0, and 8.0027 s, the discovery's late start. That is 3001 render quanta at 48 kHz; at 44.1 kHz it falls between frames, so the start's fraction is tested too.

Each file records the engine's version and commit, Playwright's version and each browser's. `--dump <dir>` also writes each render as raw float32, for diffing sample by sample locally; nothing dumped is committed.
