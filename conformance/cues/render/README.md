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

## The Bar

`bar.json`, written by `bar.mjs` before any Swift render was compared against it. For each set, rate and start: the widest spread between the references' measurements over every cue, rounded up to the step each value is recorded to, plus one step. That is Peach's own fixture rule. A render passes when, against every reference its condition lists, every gap is within the bar and no partial is gained, lost or made a window's strongest.

| Condition | References | Seconds | dB | Hz | Partial Hz | Partial dB |
|---|---|---|---|---|---|---|
| Peach, 48 kHz, from 0 and from 8.0027 s | Chromium, Firefox, WebKit, the fixture | 0.00001 | 0.09 | 0.01 | 0.02 | 0.02 |
| Peach, 44.1 kHz, from 0 | Chromium, Firefox, WebKit | 0.00001 | 0.11 | 0.02 | 0.21 | 0.04 |
| Peach, 44.1 kHz, from 8.0027 s | Chromium, Firefox, WebKit | 0.00128 | 0.28 | 0.02 | 0.16 | 0.05 |
| Features, both rates, both starts | Chromium, WebKit | 0.00001 | 0.01 | 0.01 | 0.01 | 0.01 |

Notes on each row:

- **Peach at 48 kHz** is the discovery's bar (`BAR.md` in the Soundscape In Swift report). `bar.mjs` recomputes it from these references and refuses to write if they disagree. They do not.
- **Peach at 44.1 kHz is wider, all of it from Firefox.** Chromium and WebKit agree on every number there to within one step.
  - **From 0:** Firefox reads 0.03 dB louder on the sine cues and 0.10 dB on the triangle cues. At 48 kHz its sine cues were within 0.01 dB.
  - **From 8.0027 s, between frames:** Firefox rounds each note's start up to the next frame, starting it 0.4 of a frame (9 µs) late, where Chromium and WebKit keep the start's fraction, as the spec says to. Its samples are Chromium's shifted by 0.39 to 0.40 of a frame. Its `end` for `found-8-mythic-cute` moves 1.27 ms: that is the last sample within 40 dB of the peak, on a fading glint, where a small change in level moves the crossing.
  - The conditions are kept apart, so neither of these loosens a bar on the frame grid.
- **The features** are held to Chromium and WebKit alone (`decisions.md`). They agree to 0 on every number, so each bar is one recording step.
- **Every feature reference can see its feature.** Each feature knocked out and rendered in Chromium misses its bar against both references. `bar.json` records how:
  - square for sawtooth: 8.12 dB, and 40 partials gained or lost;
  - exponential for linear: 52.59 dB;
  - sustain 0: 72.96 dB;
  - release 0: 449 ms;
  - pitch offset 0: 452.54 Hz.

## The Judge

`judge.mjs <dir>` measures a set of renders, `<dir>/<set>-<rate>-<start>/<cue>.f32`, and holds each to its condition's bar. It prints one row per cue and one column per rate and start. Each cell is the worst gap to any reference and which reference it was. It exits 1 if any render misses.

`judge.mjs <dir> --controls` checks the positive controls in `<dir>/controls/`: each mistake must miss the bar, and 0.05 dB louder must pass.
