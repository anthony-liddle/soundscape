# Render Conformance

What a Swift render of a cue is held to. The browsers' renders are recorded as measurements, never audio, by Peach of a Word's own `measure()` (`../measure/`), and a Swift render passes when `measure()` reads it within the bar of every reference.

## The References

`references.mjs` renders every cue offline in Playwright's browsers and writes what `measure()` reads from each render. Each set names its engine in `conditions.mjs`: the engine built from this checkout, or a published one fetched from npm with its tarball's sha512 checked against the registry's. CI does not run it. Rerun it on purpose, then read the diff; `--set <name>` rerenders only that set.

- **`references/peach-<rate>.json`:** Peach of a Word's 34 cues, from `../cases/peach-of-a-word.json`, in Chromium, Firefox and WebKit.
- **`references/features-<rate>.json`:** `features.cues.json`, one cue per oscillator and envelope feature Peach does not use, in Chromium and WebKit:
  - **`sawtooth`;**
  - **`linear-envelope`:** a linear envelope, three notes released in the attack, in the decay, and after holding the sustain;
  - **`fixed-decay-sustain`:** the same three, exponential, with a fixed decay;
  - **`release`:** a release of 459 ms;
  - **`pitch-offset`:** an offset of -12.5 semitones.

  Each note sits where `measure()`'s fixed envelope points and spectrum windows land on it.
- **`references/filters-<rate>.json`:** `filters.cues.json`, every filter type at a low and a high cutoff (0.3 and 0.7, 159 Hz and 2 kHz) with the least and the most resonance, on a sawtooth A3, and `ring`: a sine G3 through a lowpass at 28 Hz with the most resonance, its note stopping at 0.17 s, long enough to show where Chromium and WebKit end a biquad's ring.
- **`references/modulation-<rate>.json`:** `modulation.cues.json`, an LFO on pitch and an LFO on the filter, each slow (0.1 Hz) and fast (20 Hz) at full depth; unison at full detune; and unison through a lowpass with an LFO on it, sustained and decaying.

  These two sets were made with `soundscape-engine` 0.4.1 from npm, its integrity recorded in each file. They are held to Chromium and WebKit; Firefox is rendered and recorded beside them, never held to. Every render in them came out the same twice, and the same again with no voice ever disconnected, so neither a race nor the engine cutting a voice short is in them. Each file also records the frame each render last sounds on.
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
| Filters, 48 kHz, both starts | Chromium, WebKit | 0.00001 | 0.01 | 0.01 | 0.02 | 0.02, 0.01 from 8.0027 s |
| Filters, 44.1 kHz, both starts | Chromium, WebKit | 0.01452 | 0.01 | 0.01 | 0.02 | 0.01 |
| Modulation, both rates, from 0; 48 kHz from 8.0027 s | Chromium, WebKit | 0.00001 | 0.01 | 0.01 | 0.02 | 0.01 |
| Modulation, 44.1 kHz, from 8.0027 s | Chromium, WebKit | 0.00003 | 0.21 | 0.01 | 0.05 | 0.02 |

Notes on each row:

- **Peach at 48 kHz** is the discovery's bar (`BAR.md` in the Soundscape In Swift report). `bar.mjs` recomputes it from these references and refuses to write if they disagree. They do not.
- **Peach at 44.1 kHz is wider, all of it from Firefox.** Chromium and WebKit agree on every number there to within one step.
  - **From 0:** Firefox reads 0.03 dB louder on the sine cues and 0.10 dB on the triangle cues. At 48 kHz its sine cues were within 0.01 dB.
  - **From 8.0027 s, between frames:** Firefox rounds each note's start up to the next frame, starting it 0.4 of a frame (9 µs) late, where Chromium and WebKit keep the start's fraction, as the spec says to. Its samples are Chromium's shifted by 0.39 to 0.40 of a frame. Its `end` for `found-8-mythic-cute` moves 1.27 ms: that is the last sample within 40 dB of the peak, on a fading glint, where a small change in level moves the crossing.
  - The conditions are kept apart, so neither of these loosens a bar on the frame grid.
- **Filters at 44.1 kHz** are wide in time, 14.52 ms, from two cues alone, `bandpass-low-q0` and `notch-low-q0`: the last frame each sounds on, `stop`, is 640 frames later in WebKit than in Chromium. At the least resonance a bandpass or notch has a repeated pole, and Chromium's tail time takes a different branch there, by the last bit of its `sin` and `cos`. At 48 kHz the two browsers end every ring on the same frame.
- **Modulation at 44.1 kHz from 8.0027 s,** a start between frames, is wide on the pitch LFOs: up to 0.20 dB at an envelope point and 0.04 Hz on a partial. With an LFO on its detune, Chromium's oscillator drops the start's fraction of a frame; WebKit keeps it.
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

## Chromium's Math

A filter's coefficients and its tail time call Chromium's own copy of fdlibm, never the platform's, so that they come out the same everywhere. At a bandpass's or notch's least resonance, which branch the tail time takes, and so where its ring ends, turns on their last bit. `fdlibm.txt` holds what Chromium's `third_party/fdlibm/ieee754.cc` returns, built from that file at the revision `LICENSE-CHROMIUM` names, with `-ffp-contract=off` as Chromium builds it, and the Swift package's port must give the same bits:

- **`sin` and `cos`:** the angle of every cutoff at 0, 0.05, 0.3, 0.5, 0.7 and 1, at 48, 44.1, 3 and 768 kHz; 400 angles drawn from 0 to pi; and 100 under a millionth.
- **`log`:** 400 values drawn from e^-60 to e^60, and five edges, 1/32768 among them, the tail time's threshold.
- **`exp`:** 400 values drawn from -42 to 18, and the exponents behind the least, middle and most resonance of a lowpass or highpass, whose Q is in dB.

Node is no reference for these: V8 takes its sine and cosine from the platform's C library, and three of these answers differ from fdlibm's in the last bit.
