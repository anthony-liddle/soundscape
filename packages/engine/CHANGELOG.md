# Changelog

## Unreleased (0.4.0)

### Added

- `AudioEngine.startMIDINote(pitch, velocity, presetId, paramOverrides?)` and
  `AudioEngine.stopMIDINote(pitch)` — sustained interactive voices for live
  MIDI input. Held notes are independent of the transport (`stop()` leaves
  them sounding); `destroy()` force-stops them; re-striking a held pitch
  replaces its voice.

## 0.3.0

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
