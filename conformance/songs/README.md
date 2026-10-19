# Song Conformance

How the engine plays a song, held to the browsers: both games' music played through the engine as each game plays it, in Playwright's Chromium, WebKit and Firefox.

## The Harness

- **`harness.js`** runs in the page. It plays a game's music through the engine served as `/engine.js`, on an `OfflineAudioContext`, with the calls the game's music manager makes, ported from the game, and returns the render with what the engine did: every note it started, every voice it stole, and anything it threw.
- **`render.mjs`** serves the engine, the harness and the songs, and renders each job in a page of its own, in one browser.
- **`play.mjs`** plays both games in all three browsers, through the engine built from this checkout, and says what each browser's engine did:

  ```sh
  node conformance/songs/play.mjs
  ```

**How a render is driven:**

- **Lockstep, in Chromium and WebKit.** The render stops at every scheduler tick, every timer and every game action, and each runs there with `currentTime` reading that moment, as in a browser playing the game. The scheduler's ticks come every 1024 frames from the quantum its node was made in, as the engine's processor posts them. Timers, `requestAnimationFrame` and `performance.now` run on the audio clock.
- **Laid out ahead, in Firefox,** whose `OfflineAudioContext` has no `suspend`. The same ticks, timers and actions run in time order on a virtual clock before rendering, with `currentTime` reading the virtual time, and `stop()` with no time taken to it. That stands in for live play only where no call depends on when it is made, so Firefox is recorded, never held to.

**The games, as their music managers play them** (`fixtures/sources.json` names each file and its hash):

- **Rock Paper Scissors**, `src/engine/musicManager.ts`: one `updateState` with every track and its own presets, `setLoop(true)` and `play`; then, for each change of tension, `setTempo` and `updateMixer` with that tension's layers and volumes, and the master at 0.7.
- **The Forgetting Machine**, `src/audio/musicManager.ts`: the song with the engine's built-in presets, `updateState`, `setLoop(false)` and `play`; then its fade, one `updateMixer` a display frame for 7 s, and `stop`.
- **`held`**, not a game: one sine held at 0.6 of its peak for 2 s, the smallest song that shows how a held note is released.

**What would otherwise be random:**

- **Rock Paper Scissors' generated glitch track** is drawn from `Math.random` by the game's own `buildRandomGlitchTrack`, and `createTrack` gives it a new id every session. The harness runs the game's code as written, with `Math.random` replaced by mulberry32 seeded with 2 while it builds the track, and fixes its id as `track-glitch-random`. Its note ids stay random, and nothing heard depends on them.
- **The reverb**, on an engine that draws its impulse response from `Math.random` (0.4.1 and before): `seedReverb` gives those draws a seed of their own, so two browsers can be compared on one impulse response. Left out, each load draws its own, as a browser does.

**The scenarios** (`SCENARIOS` in `render.mjs`), each from a start at 0.128 s:

- **Rock Paper Scissors** from CALM, its tension rising at 8, 14, 20 and 26 s through every level to MELTDOWN, and 10.5 s there: 36.5 s.
- **The Forgetting Machine** whole, 60 s, with its fade from 61.5 s and its stop at 68.5 s: 70 s.

## The Fixtures

`fixtures/` holds each game's song, copied byte for byte from the commit `sources.json` names. Copy them again only from a commit of the game, and update `sources.json` with it.

## The Checks

`checks.mjs` checks the engine built from this checkout for the four problems the songs discovery found, and writes `checks.json`, so each commit records which it has and by how much:

```sh
node conformance/songs/checks.mjs
```

1. **Two loads:** The Forgetting Machine twice in one browser, each drawing its reverb as a load of the engine does. It passes when the two are the same music, by the bar's rule: every 2 s window's difference at least 80 dB under the music. It also records whether each track's impulse response came out the same both times, and whether the tracks' differ from each other.
2. **Chromium and WebKit:** both games, on one impulse response, by the same rule. Firefox is recorded beside them, never held to.
3. **A held note:** the `held` song alone, with the reverb and the compressor left out so the envelope reads as it is. Its level after the scheduler calls `noteOff`, up to 100 ms before the release, against its level just before. It passes when that step is under 0.05 dB.
4. **A NaN `attack`** on The Forgetting Machine's strings, `track001`, in Chromium:
   - **handed in** with the song. It passes when the engine refuses it at once, before anything plays, with an error naming the track and the value;
   - **slipped in** after `updateState` has the song, as a host changing its own state would. It passes when the bell and the piano still play all 20 and all 6 of their notes.
