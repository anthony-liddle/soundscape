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
- **`references/delay-<rate>.json`:** `delay.cues.json`, a 30 ms sine blip, G4, through a delay at 50, 200 and 400 ms, with no feedback, half and the most (0, 0.45 and 0.9 round the loop), each at a mix of 0.2 and 1; and `under-a-quantum`, a 1 ms delay, under one render quantum, with the most feedback. Each delay puts its echoes on `measure()`'s fixed points.
- **`references/echo-<rate>.json`:** `echo.cues.json`, `longest`: the longest echo a cue can have, the most feedback at a 1 s delay, 158 s long. A set of its own, so its bar is its own.
- **`references/distortion-<rate>.json`:** `distortion.cues.json`, a sine and a square A3 at a low (0.1) and the full amount of distortion; `into-delay`, distortion into a delay with feedback; and `voice-through-both`, a sawtooth through a resonant lowpass with an LFO on it, and unison, through distortion and a delay with feedback.

  These three sets, from `soundscape-engine` 0.4.1 too and held and recorded the same way, render until the engine would disconnect each cue's effects chain, by its own 2^-24 rule. Each browser's engine works out that deadline, `ringsUntil`, the render is silent from the frame it rounds up to, and each file records that frame, `cutFrames`, for every browser. They agree on every cue. A render runs at least two seconds, and as long as its deadline needs: 63.7 s for the longest of `delay`, 158.5 s for `longest`.
- **`references/waveshaper-chromium.json`:** what Chromium's own WaveShaperNode makes of one input, a band-limited 1 kHz square whose shaping makes harmonics far past Nyquist, with the engine's curve at 0.1 and 1, oversampled 2x. `waveshaper.mjs` writes it; `DistortionTests` holds the Swift waveshaper to it sample by sample.
- **`references/delay-wake-chromium.json`:** a window of what Chromium renders for two cues through a delay with no feedback at a delay between frames, played late at 44.1 kHz, one voice with no filter and one through a resonant lowpass. There, how many quanta the delay processed before the cue decides each read's fraction, which measure() cannot see. `delay-wake.mjs` writes it; `DelayTests` holds the Swift delay to it sample by sample.
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
| Delay, 48 kHz, both starts | Chromium, WebKit | 0.0003 | 0.01 | 0.01 | 0.02 | 0.01 |
| Delay, 44.1 kHz, both starts | Chromium, WebKit | 0.00033 | 0.02 | 0.01 | 0.03 | 0.03, 0.02 from 8.0027 s |
| Echo, both rates, both starts | Chromium, WebKit | 0.00001 | 0.01 | 0.01 | 0.01 | 0.01 |
| Distortion, 48 kHz, both starts | Chromium, WebKit | 0.00001 | 0.01 | 0.01 | 0.02 | 0.01 |
| Distortion, 44.1 kHz, both starts | Chromium, WebKit | 0.00001 | 0.01 | 0.01 | 0.02 | 0.02 |

Notes on each row:

- **Peach at 48 kHz** is the discovery's bar (`BAR.md` in the Soundscape In Swift report). `bar.mjs` recomputes it from these references and refuses to write if they disagree. They do not.
- **Peach at 44.1 kHz is wider, all of it from Firefox.** Chromium and WebKit agree on every number there to within one step.
  - **From 0:** Firefox reads 0.03 dB louder on the sine cues and 0.10 dB on the triangle cues. At 48 kHz its sine cues were within 0.01 dB.
  - **From 8.0027 s, between frames:** Firefox rounds each note's start up to the next frame, starting it 0.4 of a frame (9 µs) late, where Chromium and WebKit keep the start's fraction, as the spec says to. Its samples are Chromium's shifted by 0.39 to 0.40 of a frame. Its `end` for `found-8-mythic-cute` moves 1.27 ms: that is the last sample within 40 dB of the peak, on a fading glint, where a small change in level moves the crossing.
  - The conditions are kept apart, so neither of these loosens a bar on the frame grid.
- **Filters at 44.1 kHz** are wide in time, 14.52 ms, from two cues alone, `bandpass-low-q0` and `notch-low-q0`: the last frame each sounds on, `stop`, is 640 frames later in WebKit than in Chromium. At the least resonance a bandpass or notch has a repeated pole, and Chromium's tail time takes a different branch there, by the last bit of its `sin` and `cos`. At 48 kHz the two browsers end every ring on the same frame. So wide a bar cannot see a ring ended at a level on 8 of the 17 filter cues: see `--knockouts` below.
- **Modulation at 44.1 kHz from 8.0027 s,** a start between frames, is wide on the pitch LFOs: up to 0.20 dB at an envelope point and 0.04 Hz on a partial. With an LFO on its detune, Chromium's oscillator drops the start's fraction of a frame; WebKit keeps it.
- **Delay is wide in time, up to 0.33 ms, from `stop` alone,** on the cues with feedback at 200 and 400 ms: the last non-zero sample is up to 14 frames later in WebKit. Chromium and WebKit agree on every onset, end and duration. On arm64 Chromium works out where to read the delay line in float: 0.4 s, a float, times 48,000 is 19,200.000286, which rounds to 19,200 exactly. WebKit works it out in double, so it reads 0.000286 of a frame late, and every pass round the loop smears the echo that much further, a tail falling by about 10^-4 a frame, under 10^-12. So wide a bar would not see an echo a few frames out of place, but no knockout is that small, and `ChainEndTests` in the Swift package holds every delay cue's last frame to Chromium's.
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

`judge.mjs <dir> --knockouts` checks that the bar can see each feature the filters, LFOs, unison, the delay and distortion bring. The Swift renderer knocks each out in turn and renders every cue of its sets whose instrument has it, at both rates and both starts, into `<dir>/knockouts/<knockout>/`. Each render must miss:

| Knockout | Renders | Missed | Nearest miss, in multiples of the bar |
|---|---|---|---|
| No filter | 84 | 84 | `notch-high-q1`, 44.1 kHz from 8.0027 s: 0.32 dB, 32 |
| A lowpass's Q read as a ratio, not in dB | 36 | 36 | `lowpass-high-q1`, 44.1 kHz from 0: a partial 2.74 dB off, 274 |
| The LFO at twice its rate | 24 | 24 | `lfo-pitch-slow`, 44.1 kHz from 8.0027 s: a partial 7.02 Hz off, 140 |
| Unison detuned half as far | 12 | 12 | `unison-filter-lfo-decaying`, 44.1 kHz from 8.0027 s: a partial 14.66 dB off, 733 |
| A ring ended where it falls to 2^-24 of its level, to the sample, not at Chromium's tail time | 84 | 68 | `notch-high-q1`, 44.1 kHz from 0: 18.10 ms, 1.2; at 48 kHz, 2.48 ms, 248 |
| A delay with feedback without the render quantum every pass takes | 64 | 64 | `middle-half-low`, 44.1 kHz from 0: 26.83 dB, 1342 |
| Distortion not oversampled | 24 | 24 | `voice-through-both`, 48 kHz from 0: 6.31 dB, 631 |
| Distortion oversampled, without the resamplers' 128 frames of latency | 24 | 24 | `voice-through-both`, 48 kHz from 0: 6.31 dB, 631 |
| Distortion's k doubled | 24 | 24 | `square-low`, 48 kHz from 0: 4.64 dB, 464 |
| The delay's mix on the wet path alone, the dry path left at 1 | 88 | 88 | `short-none-low`, 44.1 kHz from 8.0027 s: 1.94 dB, 97 |

The judge prints each knockout's nearest miss. The delay's knockouts take the cues with feedback, or with any mix; distortion's, every distortion cue.

**The bar cannot see the last one on 16 renders:** 8 of the 17 filter cues at 44.1 kHz, from each start. There the filters' bar allows 14.52 ms in time, the 640 frames WebKit rings past Chromium at a bandpass's or notch's least resonance, and a ring cut at a level lands 0.7 to 8.2 ms from Chromium's end. The judge names these two conditions as blind to that knockout and fails on any other render that passes. `RingEndTests` in the Swift package holds every ring to Chromium's last frame instead.

**Distortion not oversampled misses mostly by its timing,** the 128 frames it no longer delays. With them put back, its aliases alone miss on 17 of 24 renders: not on `sine-low`, nor `sine-full` at 44.1 kHz, nor `into-delay` at 44.1 kHz from 8.0027 s, where so little is made past Nyquist that measure() reads the cue the same. `DistortionTests` holds the waveshaper to Chromium's own on `waveshaper-chromium.json`'s input instead, which aliases: within 2.4e-7, where the aliases alone are 0.09 to 0.13 off.

## Chromium's Math

A filter's coefficients and its tail time call Chromium's own copy of fdlibm, never the platform's, so that they come out the same everywhere. At a bandpass's or notch's least resonance, which branch the tail time takes, and so where its ring ends, turns on their last bit. `fdlibm.txt` holds what Chromium's `third_party/fdlibm/ieee754.cc` returns, built from that file at the revision `LICENSE-CHROMIUM` names, with `-ffp-contract=off` as Chromium builds it, and the Swift package's port must give the same bits:

- **`sin` and `cos`:** the angle of every cutoff at 0, 0.05, 0.3, 0.5, 0.7 and 1, at 48, 44.1, 3 and 768 kHz; 400 angles drawn from 0 to pi; and 100 under a millionth.
- **`log`:** 400 values drawn from e^-60 to e^60, and five edges, 1/32768 among them, the tail time's threshold.
- **`exp`:** 400 values drawn from -42 to 18, and the exponents behind the least, middle and most resonance of a lowpass or highpass, whose Q is in dB.

Node is no reference for these: V8 takes its sine and cosine from the platform's C library, and three of these answers differ from fdlibm's in the last bit.
