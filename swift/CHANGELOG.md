# Changelog

The Swift package's changelog, for its bare semver tags. The npm engine's is in `packages/engine/CHANGELOG.md`, for its `engine-v*` tags.

## Unreleased

### Added

- **Filters,** every `filterType`: lowpass, highpass, bandpass and notch. They follow Chromium's biquad: the spec's coefficients, with Q in dB for a lowpass or highpass, worked out in double from Chromium's own copy of fdlibm, ported so they come out the same on every platform; its precision; and its ring, which ends at the tail time Chromium and WebKit give the filter, on a render quantum's edge.
- **The LFO,** on the filter's cutoff or on pitch, at any `lfoRate` and `lfoDepth`, wired as the engine wires it. On the cutoff, the filter works out its coefficients frame by frame; on pitch, each oscillator takes Chromium's a-rate path.
- **Unison,** a second oscillator, each detuned half of `unisonDetune * 50` cents away.
- **The delay,** at any `delayTime`, `delayFeedback` and `delayMix`. It follows Chromium's delay line as it runs on arm64, each frame read between two at a place worked out in float, and the render quantum Chromium and WebKit add to every pass round a feedback loop.
- **Distortion,** the engine's curve, read between its points in float, and oversampled 2x with Chromium's resamplers and their 128 frames of latency. With no distortion the curve is a straight wire.
- **Effects chains,** one for each instrument with any effect, shared by its notes, as the engine builds them. A render through one runs until the engine would disconnect it, by the engine's own 2^-24 rule: the longest, an echo at the most feedback and a 1 s delay, is 158.5 s.

Each is held to Chromium and WebKit within the bar in `conformance/cues/render`, against references made with `soundscape-engine` 0.4.1.

### Changed

- **Memory:** `CuePlayer` holds each cue's render whole, four bytes a frame a channel, so a cue through a long echo holds tens of megabytes: 58 MiB for the longest, on a stereo output at 48 kHz.
- **Notices:** `LICENSE-CHROMIUM` now also carries the BSD notices of Chromium's biquad and delay files, its resamplers and its direct convolver, and fdlibm's notice. An app that ships the package must carry them as well as the ones it carried before.

### Removed

- **Refusals:** `CueRenderer.unsupported(_:)`, and every refusal of a valid document. `CueRenderer(_:sampleRate:)` now throws only for a rate no context could have, and `CuePlayer.load(_:)` only when its output cannot be built. A caller of `unsupported(_:)` can drop the call: every document the validator accepts renders.

## 0.1.0 - 2026-10-09

0.1.0, the first release. The check on an iPhone in `swift/CueCheck.swiftpm/README.md` passed on Antoine's iPhone on 2026-10-09.

### Added

- **Reading and validating cue documents,** `CueDocument`, as the engine reads them. The JSON reader has `JSON.parse`'s rules, and every problem has the engine's path and message, held to it by the corpus in `conformance/cues` that both languages run.
- **Rendering cues offline,** `CueRenderer`, at any rate from 3 to 768 kHz and from any start. It covers every waveform, every envelope shape and the pitch offset, with Chromium's band-limited oscillator design. Every reference render is held to Chromium and WebKit within the bar in `conformance/cues/render`, measured by Peach of a Word's `measure()`.
- **Refusals with a path:** a document that uses a filter, an LFO, unison, delay or distortion is refused whole, with `CueDocumentError`.
- **Playing cues,** `CuePlayer`, on iOS 17 and macOS 14:
  - its API mirrors the engine's `loadCues`, `playCue`, `setCueVolume` and `setCuesMuted`;
  - cues are rendered at the output's rate, and rendered again when it changes;
  - they play on a pool of 8 voices, and overlapping cues sum exactly;
  - the session is `.ambient`, with interruptions, a media services reset and the app going inactive handled;
  - `onEvent` reports each of these, and a manual output renders to samples.
- **`soundscape-play`,** a command-line tool to hear a cue file through a Mac's speakers.
- **Cue Check,** an app for hearing the player on an iPhone, for testing only.
