# Changelog

The Swift package's changelog, for its bare semver tags. The npm engine's is in `packages/engine/CHANGELOG.md`, for its `engine-v*` tags.

## Unreleased

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
