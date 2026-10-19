# Changelog

## Unreleased

### Added

- **Checks for a song's values, exported:** `stateValueProblems`,
  `instrumentValueProblems`, `mixerValueProblems`, `trackMixerValueProblems`,
  `tempoValueProblems` and `loopLengthValueProblems`, each listing every value
  that cannot play with its path, as a `ValueProblem`; `SoundscapeValueError`,
  which `updateState` throws with them and a call made while the music plays
  reports; and `reportSkipped`, which reports as the engine does, for a host
  to do the same.
- **The reverb's generator, exported to check against:** `reverbSeedOf`,
  `mulberry32`, `reverbImpulse` and `REVERB_SECONDS`, as the README's The
  Reverb specifies them, to the bit.
- **`EffectsChainOptions.reverbSeed`,** the seed of a chain's impulse
  response. The engine gives each track's chain `reverbSeedOf(track.id)`.

### Changed

- **A held song note holds until its release, in Chrome and Safari too.** The
  release ended the envelope with `cancelAndHoldAtTime`, which after the last
  scheduled event inserts nothing, so the release ramp started from the
  decay's end. A note held past its decay stepped down the moment the
  scheduler called `noteOff`, up to 100 ms before its release. It now ends the
  envelope at the level it has at the release, computed from the envelope the
  voice scheduled, in every browser, as Firefox already played it. Sustained
  notes are louder at their ends: The Forgetting Machine 1 to 3.5 dB in the
  windows where its strings release, and about 12 dB from 60 s, where its last
  chord no longer fades through its hold; Rock Paper Scissors' pad up to 1.9
  dB, its bass 1.1 and its lead 0.6. `previewNote` and live MIDI notes release
  the same way.
- **Each track's reverb is seeded from its id, the same on every load.** Its
  impulse response drew from `Math.random`, so every load of a song had a
  reverb of its own: two loads of The Forgetting Machine differed by a median
  15 dB under the music. It now comes from a specified generator, seeded from
  the track's id. For a listener, any one play sounds as before, since each
  load was one random draw of the same room and this is another. What changes
  is that it stays that draw, on every load and in every browser, and every
  track keeps a draw of its own, so adding a track changes no other's. An
  `EffectsChain` made without a `reverbSeed` takes the empty id's,
  `reverbSeedOf('')`, so every such chain now has the same reverb, where each
  drew its own.
- **A song note's oscillators are set with values.** Their frequency and
  detune, and the LFO's frequency, are set as values before they start, as
  cues set them, not as events at the note's start, where Chromium began such
  an oscillator at a different phase and WebKit could begin it a sample late.
  Inaudible: a song note now starts the same way in both.
- **A track's waveshaper is not oversampled while the track has no
  distortion,** as a cue's is not (#106). WebKit oversampled a waveshaper with
  no curve, delaying the music 6 samples and filtering it. In WebKit, music
  with no distortion is no longer filtered.

### Fixed

- **A value that cannot play is refused where it arrives,** before anything
  changes, with a `SoundscapeValueError` naming each value with its path and
  track: a number that is not finite or is outside the range the types
  document, 0 to 1, or -24 to 24 semitones for the pitch offset, or a choice
  that is not one of its own. `updateState` throws it, as `loadCues` throws
  for a cue document. A call made while the music plays, `updateMixer`,
  `previewNote`, `startMIDINote`, `setTempo` or `setLoopLength`, never throws
  into its caller: it is skipped whole, so a note plays nothing and a mixer,
  tempo or loop length stays as it was, and the error is reported once,
  through `reportError`, or `console.error` where there is none. A NaN
  `attack` on The Forgetting Machine's strings threw at every scheduler tick
  while a strings note was due, 182 times over the song, and silenced the
  strings. Rock Paper Scissors passes `decay` and `release` above 1 to
  `previewNote` in its two endings' sound effects: each of those notes now
  plays nothing and is reported, and the call returns to the game.
- **One track's error no longer silences the tracks after it.** A value that
  reaches a note past those checks, in a state its host changes after handing
  it over, now costs that note alone: it is skipped, reported once through
  `reportError`, or `console.error` where there is none, and every other note
  is still scheduled. The error used to end each scheduler tick early, so with
  the strings' NaN the bell lost 2 of its 20 notes and the piano 1 of its 6. A
  note whose start or end is not a time no longer loops the scheduler forever
  or holds its voice.

## 0.4.1 - 2026-10-09

### Added

- **`VoiceSynthesizer.playNote` returns the audio-clock time the voice falls
  silent:** its sources' stop, and after that its filter's ring. It returned
  nothing.

### Fixed

- **A filtered cue's ring plays out whole, the same on every render.** A cue
  voice was disconnected as soon as its oscillator's end was reported, while
  a resonant filter was still ringing, so Chromium and WebKit cut the ring at
  a different point on every offline render (#128). A voice played with
  `playNote` now stays connected until its filter has rung out, and the audio
  clock decides when that is: once the ring is under 2^-24 of its level when
  the note stopped, worked out from the filter's settings. The longest, a
  bandpass or notch at 20 Hz with a Q of 20, rings 5.35 s. Its `onEnded`
  reports the end then. A replaced cue's effects count that ring before their
  echoes, and `destroy()` disconnects the cue voices still sounding.
- **Replacing the cue document keeps a ringing cue's echoes.** `loadCues`
  disconnected a replaced cue's effects as soon as its last note's end was
  reported, so the echoes after it were cut (#123). Offline, Chromium and
  WebKit cut them every time, and Firefox and the engine's Node tests
  whenever the end was reported before the render finished, which made a
  Node test fail at random. A replaced instrument's effects now stay
  connected until its echoes have rung out, and the audio clock decides when
  that is: once every echo still to come is under 2^-24 of one already heard.
  For the longest echo a cue can have, feedback 0.9 at a 1 s delay, that is
  158 passes round the delay, 158.4 s after the last note stops at 48 kHz.
  They are disconnected then, or at once if nothing they played still rings,
  and when the engine is destroyed.
- **No warning from `node-web-audio-api` for an effects chain without
  distortion.** Every chain with distortion at 0 set its waveshaper's curve to
  null, which it already was, and `node-web-audio-api` warned at each:
  "Setting the 'curve' property on 'WaveShaperNode' to 'null' is not
  supported yet". It no longer sets a null curve over one already null.
  Nothing sounds different.
- **`midiToNoteName` names a fractional pitch.** It returned `"undefined5"`
  for a pitch such as 78.99998074500876, which a cue document allows. It now
  gives the nearest note and the distance from it in cents, to two places:
  `"B7 -13.69¢"` for 106.8631178836571, and `"G5 0.00¢"` for a pitch
  that rounds to the note itself. The octave comes from the nearest note, so
  59.99 is `"C4 -1.00¢"`. A whole number is named exactly as before.

## 0.4.0 - 2026-10-07

Everything here is additive but two fixes: to the release in browsers
without `cancelAndHoldAtTime`, which means Firefox, and to the
distortion curve, which was centred half a point off. Everywhere else music,
`previewNote`, the transport and the master chain sound exactly as they did in
0.3.0, held to sample-exact references recorded before any of it changed. The
transport's reference, whose bass and lead distort, was recorded again by the
same engine with only the curve centred.

### Added

- **Cues**, short sound effects defined in a JSON cue document and played on
  the audio clock. `loadCues(document)` validates and loads a document;
  `playCue(name, when?)` schedules every note whole, its start, envelope and
  stop, at once, one voice per note, so cues overlap freely and render
  offline. Nothing a cue schedules is ever cancelled, so a cue sounds the same
  in every browser, Firefox included, which has no `cancelAndHoldAtTime`.
  `setCueVolume`, `setCuesMuted` and `getCueNames` go with them. Cues have
  their own route past the master gain and the master compressor, and still
  feed the analyser.
- **The cue document format**: `format`, `version`, document-local
  `instruments` by name, and `cues` by name, each a list of notes with a
  stable `id`, an `instrument`, `start` and `duration` in seconds, a MIDI
  `pitch` (fractional allowed) and an absolute `level`.
  `parseCueDocument`, `validateCueDocument` and `CueDocumentError` reject
  rather than repair, naming the path to every bad value;
  `serializeCueDocument` writes the canonical form, so saving an unchanged
  document reproduces its bytes.
- **`decayUntilRelease: true`** on a cue instrument, in place of `decay`: the
  decay runs from the end of the attack to each note's release and reaches
  the sustain level there, so one instrument serves notes of any length,
  each fading over its own. An instrument has exactly one of the two. Both,
  neither, or any value of `decayUntilRelease` but `true` is rejected, with
  the path to the value at fault. 0.4.0-rc.1 rejects a document that uses
  it, naming the field as unknown and the decay as missing.
- **`loadCues` keeps its own copy of the document.** Changing the one passed
  in afterwards, as an editor will, changes nothing that plays until it is
  loaded again.
- **`envelopeCurve: 'exponential'` with `envelopeFloor`**, opt-in on
  `InstrumentParams`: an envelope that ramps by a constant ratio, from and to
  an absolute floor.
- **`filterType: 'none'`**, which takes the filter out of the voice entirely.
- **`AudioEngine` accepts a context**: `new AudioEngine({ context })` plays
  into a context you supply, an `OfflineAudioContext` included. The engine
  never closes a context it was given, and `resume()` leaves an offline one
  alone.
- `VoiceParams.peak` and `VoiceParams.setAsValues`, which cues use.
- `VoiceSynthesizer.playNote(params, startTime, duration)` plays a whole note,
  scheduling its attack, decay, any hold, release and stop at once, with
  nothing cancelled; `dispose()` releases an ended voice's nodes without
  touching a param. Cues use both.
- `EffectsChain` takes options. `oversampleOnlyWhenDistorting` leaves the
  waveshaper's oversampling off while there is no distortion. WebKit
  oversamples even a null curve, delaying the signal 6 samples and filtering
  it, where Chromium and Firefox pass it through. Cue chains use it, so cues
  sound the same in every browser; track chains do not yet (#106). And
  `reverb: false` builds a chain with no reverb send, which refuses a
  `reverbMix` above 0 rather than ignore it.
- **No effects chain a cue cannot hear.** A cue instrument whose effects are
  all exactly 0 gets no chain, and its voices play straight into the cue
  route; a chain at zero passed a cue through unchanged, but its convolver,
  delay and waveshaper ran for as long as the context did. An instrument
  with any effect above 0 gets a chain with no reverb send, since a cue's
  `reverbMix` must be 0, so its convolver could never be heard. Peach of a
  Word's eight cue instruments, none with an effect, cost 53 to 57 ms of
  render time per second of audio in Chromium, idle, and about 100 MB per
  engine; now 0.55 ms and under 1 MB. Track chains are unchanged. The cues
  with no effect and with delay are held to references recorded before the
  change; the cue through distortion, whose oversampling rounds differently
  by processor, to a chain built the old way in the same run, both to 1e-6.
- `soundscapeInstrumentProblems(state)` names each value that would stop an
  instrument in a soundscape state from playing, with the path to it, such
  as `presets[0].params.decayUntilRelease`: the 0.4.0 envelope and filter
  rules and the fields only a cue can have, on each preset and on the
  instrument each track plays.

### Changed

- `VoiceSynthesizer` and `EffectsChain` take a `BaseAudioContext`. Every
  existing caller still fits.
- `VoiceParams.instrument` also takes a `CueInstrument`. `noteOn` refuses one
  whose decay lasts until the release, since it starts a note without
  knowing when it will be released; `playNote` plays it.
- `FilterType` gains `'none'` and `EnvelopeCurve` is new. **A `switch` over
  `FilterType` that was exhaustive is no longer**, at the type level.
- `validateSoundscapeState` accepts the new fields, rejects an exponential
  envelope without a floor between 0 and 1, a floor on any other curve, and
  an LFO aimed at a filter that is not there, on presets and on the
  instrument a track plays once its overrides are applied. No file from
  0.3.0 can hold these fields, so none is newly rejected.
- `validateSoundscapeState` refuses `decayUntilRelease` on a preset or in a
  track's overrides, whatever its value, at load. Only a cue can play it: the
  transport starts a note without knowing when it will be released, and
  `noteOn` would refuse the note at play. `soundscapeInstrumentProblems`
  gives the path. No earlier file can hold the field.

### Fixed

- **A note's release where `cancelAndHoldAtTime` is missing, which means
  Firefox.** The fallback read `gain.value` for a linear envelope, which is
  stale: the release is scheduled ahead of time, and before rendering the
  value is the param's default. For an exponential envelope it ended the
  decay again only when the release fell strictly before the decay's end, so
  a release exactly at the end held the peak and stopped in one sample, and
  Firefox, which cancels a ramp that ended up to half a sample earlier, did
  the same to every release just after it. The fallback now takes the level
  from the envelope the voice scheduled, and always ends the envelope at the
  release with a ramp of its own curve: where the cancel removed a ramp, that
  retraces it, and where it removed nothing, the ramp is flat. No comparison
  with the decay's end decides which. Browsers with `cancelAndHoldAtTime` are
  unaffected.
- **Distortion puts out nothing for nothing in** (#110). The curve had 44,100
  points at x = 2i/44100 - 1, but Web Audio reads a curve of n points at
  index (n - 1)(v + 1)/2, so an input of 0 fell halfway between two points
  and read half of one: an offset of about -(1 + 100 × distortion / π) / 44100,
  -4.554e-4 (-66.8 dBFS) at a distortion of 0.6 and -7.434e-4 at 1. Chromium
  and WebKit run a waveshaper with nothing playing into it, so every chain
  with distortion, a track's or a cue's, put that offset out for as long as
  the context ran; Firefox put it out while anything played through the chain.
  The curve now has 44,101 points, the old ones and the one at x = 1 it
  lacked, so an input of 0 is read at the centre point, which holds 0. Every
  distorted track and cue moves by that half point along the curve: a bass
  note at 0.6, played by the transport, changes by 0.0006 dB in level and at
  most 0.005 dB in any of its first twelve harmonics, and the difference is
  61 dB below the note. A plain `WaveShaperNode` with a centred curve of its
  own now holds the cue path and the track path to 1e-6 in Chromium, Firefox
  and WebKit, and an engine with a distorting cue instrument loaded and
  nothing playing puts out exactly 0 in all three. `previewNote`, which plays
  through no effects chain, is unchanged.

## 0.3.0

### Added

- `AudioEngine.startMIDINote(pitch, velocity, presetId, paramOverrides?)` and
  `AudioEngine.stopMIDINote(pitch)` — sustained interactive voices for live
  MIDI input. Held notes are independent of the transport (`stop()` leaves
  them sounding); `destroy()` force-stops them; re-striking a held pitch
  replaces its voice.

### ⚠️ Audible changes — re-audition your patches

- **Distortion is now on the main signal path.** It was previously wired
  inside the delay wet path, which made it completely inaudible whenever
  `delayMix` was `0` (including the built-in `bass` and `percussion`
  presets). Distortion now shapes the signal regardless of the delay mix, and
  delay echoes repeat the distorted signal. Any existing patch with
  `distortion > 0` will sound different.
- **Distortion curve normalized.** The curve now keeps unity peak level at
  every amount (previously the output dropped ~3x the moment the knob left
  zero) and approaches a clean pass-through as the amount approaches zero.
- **Smoother note releases.** Releases now start from the envelope's value at
  the scheduled stop time via `cancelAndHoldAtTime` (with a fallback for
  browsers without it), eliminating clicks on notes released mid-attack.

### Fixed

- **Loop boundaries are now sample-accurate.** The scheduler works in
  absolute time across loop iterations, so the next iteration's downbeat is
  scheduled inside the lookahead window before the wrap — previously the
  first notes of every loop started late by up to a scheduler tick. Notes
  whose tails cross the loop boundary now receive their note-off (they
  previously sustained until stolen), and a note can sound in two adjacent
  iterations at once.
- Voice stealing no longer lets the stolen note's pending note-off cut short
  the note that reuses the voice.
- `previewNote` waits for the instrument's full release tail before tearing
  the voice down; long releases are no longer truncated at 1 second.

### Changed

- **`validateSoundscapeState` is strict.** NaN/Infinity numeric fields,
  unknown `waveform`/`filterType`/`lfoTarget` values, incomplete instrument
  params, and malformed mixer entries are now rejected. Files that previously
  "passed" with these defects either played incorrectly or threw during
  playback; validate-and-repair before loading if you accept user files.
- The AudioWorklet scheduler posts ticks every ~23 ms instead of ~2.9 ms
  (`onBeatUpdate` fires accordingly less often), cutting cross-thread message
  traffic ~8x with no impact on scheduling accuracy (lookahead is 100 ms).
- Effects parameters are re-applied only when their values change; the
  distortion curve is cached by amount.

## 0.2.3

- `exports` map lists the `types` condition first, and declarations are
  bundled into a single flat `index.d.ts` — fixes missing/broken types for
  consumers on `node16`/`nodenext` module resolution.
- All built-in presets are exported by name (`pianoPreset`, `organPreset`,
  `stringsPreset`, `bellPreset`, `marimbaPreset` were missing).
