# Changelog

The Swift package's changelog, for its bare semver tags. The npm engine's is in `packages/engine/CHANGELOG.md`, for its `engine-v*` tags.

## Unreleased

## 0.2.1 - 2026-10-23

0.2.1 starts a cue for now whole. Seven steps of the check on an iPhone in `swift/CueCheck.swiftpm/README.md` passed on Antoine's iPhone against `main` with this fix, as he reported on 2026-10-23.

### Fixed

- **A cue asked for now plays whole.** It was put on the frame `currentTime` read, which on a device is the start of the render cycle last rendered, and the audio thread can be past that frame by the time the voice starts. A voice put on a frame already rendered skips every frame before the one it starts in, so the cue lost its head: a cycle's worth, or several when the audio thread ran late. Peach of a Word's `tick`, whose sound lies between its 9th and 17th ms, lost its first 512 frames in 3 to 10 of every 1,020 taps on an iPhone Simulator, and fell silent when it lost 1,024 or more: one cycle at a 21 ms buffer, or several cycles' lag. A cue for now starts at its voice's next render instead. A time to come is still kept to the frame.
  - **0.2.0:** 42 of 6,120 ticks lost their head, in six runs of those taps.
  - **This release's player:** 6,120 ticks, in six runs, every one started whole. So did 6,120 more from a test build's copy of the same rule.
- **A cue that started late keeps its voice.** A voice's end is reckoned from `currentTime`, so a cue that started later than the clock knew could still be sounding when the next cue took the first free voice, and was cut. A cue now takes the voice whose cue ended longest ago.

### Known Issue

- **A rarer gap inside a cue.** In 2 of those 18 runs, one under 0.2.0 and one under this release, a tick started whole, the recording went silent partway through it, and the tick then carried on from its own frames. Its cause is not known, and this release does not change it.

## 0.2.0 - 2026-10-14

0.2.0 renders every feature a cue document can hold. The check on an iPhone in `swift/CueCheck.swiftpm/README.md`, which now plays every feature, passed on Antoine's iPhone on 2026-10-14. In a Release build, on a stereo output at 48 kHz, loading the 55 feature cues took 0.26 s, which covers reading the document and copying the renders into the player's buffers as well as rendering them. Their renders held 157.4 MiB, and the app used 178.9 MiB. With Peach of a Word's cues loaded again, they held 4.3 MiB, and the app 22.7 MiB.

### Added

- **Filters,** every `filterType`: lowpass, highpass, bandpass and notch. They follow Chromium's biquad: the spec's coefficients, with Q in dB for a lowpass or highpass, worked out in double from Chromium's own copy of fdlibm, ported so they come out the same on every platform; its precision; and its ring, which ends at the tail time Chromium and WebKit give the filter, on a render quantum's edge.
- **The LFO,** on the filter's cutoff or on pitch, at any `lfoRate` and `lfoDepth`, wired as the engine wires it. On the cutoff, the filter works out its coefficients frame by frame; on pitch, each oscillator takes Chromium's a-rate path.
- **Unison,** a second oscillator, each detuned half of `unisonDetune * 50` cents away.
- **The delay,** at any `delayTime`, `delayFeedback` and `delayMix`. It follows Chromium's delay line as it runs on arm64, each frame read between two at a place worked out in float, and the render quantum Chromium and WebKit add to every pass round a feedback loop.
- **Distortion,** the engine's curve, read between its points in float, and oversampled 2x with Chromium's resamplers and their 128 frames of latency. With no distortion the curve is a straight wire.
- **Effects chains,** one for each instrument with any effect, shared by its notes, as the engine builds them. A render through one runs until the engine would disconnect it, by the engine's own 2^-24 rule: the longest, an echo at the most feedback and a 1 s delay, is 158.5 s.

Each is held to Chromium and WebKit within the bar in `conformance/cues/render`, against references made with `soundscape-engine` 0.4.1.

- **Cue Check plays every feature,** from `examples/cues/every-feature.cues.json`, every reference document merged, beside Peach of a Word's cues. It shows how long a load takes and how much memory the renders hold. The editor's cue page, `apps/editor/examples/cues.html`, plays the same document in a browser, for Safari on the same phone.

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
