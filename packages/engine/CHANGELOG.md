# Changelog

## Unreleased

Planned as 0.4.0. Everything here is additive: music, `previewNote`, the
transport and the master chain sound exactly as they did in 0.3.0, held to
sample-exact references recorded before any of it changed.

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
- `EffectsChain` takes options, and `oversampleOnlyWhenDistorting` leaves the
  waveshaper's oversampling off while there is no distortion. WebKit
  oversamples even a null curve, delaying the signal 6 samples and filtering
  it, where Chromium and Firefox pass it through. Cue chains use it, so cues
  sound the same in every browser; track chains do not yet (#106).

### Changed

- `VoiceSynthesizer` and `EffectsChain` take a `BaseAudioContext`. Every
  existing caller still fits.
- `FilterType` gains `'none'` and `EnvelopeCurve` is new. **A `switch` over
  `FilterType` that was exhaustive is no longer**, at the type level.
- `validateSoundscapeState` accepts the new fields, rejects an exponential
  envelope without a floor between 0 and 1, a floor on any other curve, and
  an LFO aimed at a filter that is not there, on presets and on the
  instrument a track plays once its overrides are applied. No file from
  0.3.0 can hold these fields, so none is newly rejected.

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
