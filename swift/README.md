# Soundscape For Swift

Reads, validates, renders and plays Soundscape cue files on Apple platforms, as the TypeScript engine in `packages/engine` does in a browser. A cue is a short sound effect, defined in a JSON cue document; Peach of a Word's 34 sounds are the first set it plays.

It is held to the engine at every step. Reading and validating follow a corpus that both languages run (`conformance/cues`). Every render is held to Chromium's and WebKit's within a bar written before any Swift render was compared, measured by Peach of a Word's own `measure()`. The player is proved sample for sample against the renders in AVAudioEngine's manual rendering mode.

## Add It

The package is this repository: its `Package.swift` is at the root, its sources are under `swift/`. Its versions are bare semver tags, `0.1.0` and on, separate from the engine's `engine-v*` tags on npm.

In Xcode, File › Add Package Dependencies, then enter:

```
https://github.com/anthony-liddle/soundscape
```

Choose **Up to Next Minor Version** from `0.1.0`: while the version starts with 0, a minor version may break something. Add the **Soundscape** product to your app's target.

In a `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/anthony-liddle/soundscape.git", .upToNextMinor(from: "0.1.0")),
],
targets: [
    .target(name: "MyGame", dependencies: [.product(name: "Soundscape", package: "soundscape")]),
]
```

The one product holds two modules: `Soundscape`, which reads and renders, and `SoundscapePlayer`, which plays.

## Use It

```swift
import SoundscapePlayer

@MainActor
final class Sounds {
    let player = CuePlayer()

    func load() async throws {
        let url = Bundle.main.url(forResource: "cues", withExtension: "json")!
        try await player.load(parsing: String(contentsOf: url, encoding: .utf8))
    }

    func found() throws {
        try player.play("found-5-set")
    }
}
```

## The API

### Playing: `CuePlayer`, In `SoundscapePlayer`

A `@MainActor` class, mirroring the engine's cue methods:

| Engine | `CuePlayer` |
|---|---|
| `loadCues(document)` | `load(_:)`, or `load(parsing:)` for JSON text |
| `getCueNames()` | `cueNames` |
| `playCue(name, when)` | `play(_:at:)` |
| `setCueVolume(volume)` | `setCueVolume(_:)`, read back as `cueVolume` |
| `setCuesMuted(muted)` | `cuesMuted` |
| `context.currentTime` | `currentTime` |
| `destroy()` | `stop()`, which the next cue undoes |

**Loading.**
- `load` renders every cue when the document loads, off the main thread, at the output's sample rate, and renders them again if that rate changes.
- It refuses a document the library cannot render with `CueDocumentError`, keeping the document loaded before.
- Cues still ringing from the previous document play out.

**Playing.**
- `play(_:at:)` throws `CuePlayerError.notLoaded` before a load, and `CueRenderError.noCue` for a name the document lacks, with the engine's message.
- As in the engine, a time to come, on `currentTime`'s clock, is kept to the frame. A time gone, or none, is now.
- A cue asked for while the cues render again for a new rate is skipped.

**Overlap.** Cues play on a pool of `AVAudioPlayerNode`s, 8 unless `init(output:voices:)` says otherwise, and overlapping cues sum exactly. When every voice is busy, the cue that ends soonest is cut. A voice is held from the moment its cue is asked for, so a cue scheduled far ahead holds one until it ends.

**The rest:**
- `duration(of:)` gives a cue's length in seconds.
- `sampleRate` and `outputChannelCount` say what the player read from the output.
- `onEvent` is called with each `CuePlayer.Event`: the engine starting, an interruption, the output changing, a rebuild, a media services reset, the app going inactive.

**The audio session.** On iOS, a device output sets the session's category to `.ambient` and makes it active, each time it starts. So the Ring/Silent switch silences cues, and they mix over other apps' audio.
- An interruption, or the app going inactive, stops the engine, and the next cue starts it again.
- A media services reset rebuilds everything, the category included.
- Route changes need nothing of their own: one that changes the output's rate or channels arrives as `AVAudioEngineConfigurationChange`, and the player answers it.
- An app that needs another category should know the player sets this one.

**Rendering to samples.** `CuePlayer(output: .manual(.init(sampleRate:channels:)))` renders with `renderOffline(_:)` instead of a device. That is how the tests hear it.

### Reading And Validating: `CueDocument`, In `Soundscape`

- `CueDocument(parsing:)` throws `CueDocumentError`, whose `problems` are the engine's, path for path and message for message.
- `CueDocument.parse(_:)` returns a `Result`.
- A document gives `cues`, `cueNames` in the engine's order, `instruments` and `instrumentNames`.

The JSON reader is the library's own, with `JSON.parse`'s rules, not Foundation's.

### Rendering: `CueRenderer`, In `Soundscape`

- `CueRenderer(_:sampleRate:)` and `CueRenderer(parsing:sampleRate:)` take any rate in `CueRenderer.sampleRates`, 3 to 768 kHz.
- `render(_:at:)` returns a cue's samples, mono, from its start through its last note's stop. It keeps a start's fraction of a frame, as Chromium and WebKit do.

## What It Plays, And What It Refuses

**It plays cue format version 1:**
- every waveform: sine, square, sawtooth and triangle;
- every envelope shape: linear or exponential curves, a fixed decay, or `decayUntilRelease`;
- the pitch offset.

A note's level is its peak, and velocity plays no part, as in the engine. Reverb is not part of the cue format; the engine refuses it too.

**It refuses, with the whole document and a problem at each path:**
- a filter, a `filterType` other than `none`;
- an LFO, an `lfoDepth` above 0;
- unison, a `unisonDetune` above 0;
- delay, any of `delayTime`, `delayFeedback` or `delayMix` not 0;
- distortion, a `distortion` not 0.

A filtered cue played without its filter would sound wrong and say nothing, so it fails at load, where it can be explained. These come next, held to Chromium and WebKit.

## Platforms

- **The player,** `SoundscapePlayer`: iOS 17 and macOS 14 or later. It is built on AVFoundation and builds to nothing where AVFoundation is missing.
- **Reading, validating and rendering,** `Soundscape`: wherever Swift runs. They use the standard library and the C library alone, and are tested on macOS, in the iOS Simulator and on Linux.
- **Toolchain:** Swift tools version 6.0, so Xcode 16 or later, in Swift 6 language mode. CI builds with Xcode 26.6 and with Swift 6.4 on Linux.

## Licences

The package is MIT licensed: see `LICENSE`.

Its band-limited oscillator, in `swift/Sources/Soundscape/Render/`, follows the design of Chromium's, so Chromium's BSD-3-Clause notice applies to that part. The notice is in `LICENSE-CHROMIUM`.

**An app that ships Soundscape must carry Chromium's BSD notice as well as the MIT licence,** for example on its acknowledgements screen.

## Hear It

- On a Mac: `swift run soundscape-play conformance/cues/cases/peach-of-a-word.json` plays a cue file through the speakers. Add cue names after the file to play only those, or `--list` to list them.
- On an iPhone: Cue Check, in `swift/CueCheck.swiftpm`, is an app for testing only. Its README says how to run it.

## Changes And Releases

- `swift/CHANGELOG.md` is this package's changelog, separate from the engine's.
- `RELEASING.md`, at the repository's root, has the steps for both.
