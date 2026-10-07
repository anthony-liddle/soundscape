# soundscape-engine

[![npm](https://img.shields.io/npm/v/soundscape-engine.svg)](https://www.npmjs.com/package/soundscape-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/anthony-liddle/soundscape/blob/main/LICENSE)

Browser-based music sequencer and synthesizer engine powered by the Web Audio API.

## Compose Visually

Use the **[Soundscape Editor](https://anthony-liddle.github.io/soundscape/)** to compose music with a visual piano roll, then export JSON to play back with this engine.

## Install

```bash
npm install soundscape-engine
```

## Quick Start

```ts
import {
  AudioEngine,
  builtInPresets,
  defaultMetadata,
  createTrack,
  createNote,
  createMixerState,
} from 'soundscape-engine';

// Create an engine instance and initialize the audio context
const engine = new AudioEngine();
await engine.initialize();

// Build a simple soundscape state
const track = createTrack({ name: 'Lead', presetId: 'lead' });
track.notes.push(
  createNote({ pitch: 60, startTime: 0, duration: 1, velocity: 100 }),
  createNote({ pitch: 64, startTime: 1, duration: 1, velocity: 100 }),
  createNote({ pitch: 67, startTime: 2, duration: 1, velocity: 100 }),
);

const state = {
  metadata: { ...defaultMetadata, tempo: 120, lengthBeats: 4 },
  tracks: [track],
  presets: builtInPresets,
  mixer: createMixerState([track]),
};

engine.updateState(state);
engine.play();
```

## API

### `AudioEngine`

The core class that manages Web Audio scheduling and playback.

| Method | Description |
|--------|-------------|
| `initialize()` | Create the `AudioContext` (must be called after a user gesture) |
| `resume()` | Resume a suspended audio context |
| `updateState(state)` | Load or update the full `SoundscapeState` |
| `play(startBeat?)` | Start playback from the given beat (default `0`) |
| `stop()` | Stop playback and release all voices |
| `setTempo(bpm)` | Change tempo without restarting playback |
| `setLoop(enabled)` | Enable or disable looping |
| `setLoopLength(beats)` | Set the loop length in beats |
| `getCurrentBeat()` | Get the current playback position |
| `getIsPlaying()` | Check whether the engine is playing |
| `onBeatUpdate(cb)` | Register a callback that fires each scheduling tick. Supports multiple subscribers — returns an unsubscribe function. |
| `previewNote(pitch, velocity, presetId, overrides?)` | Audition a single note |
| `loadCues(document)` | Load a cue document (see [Cues](#cues)); throws `CueDocumentError` if it is invalid |
| `playCue(name, when?)` | Play a cue, every note scheduled on the audio clock, at `when` or now |
| `getCueNames()` | The names of the loaded document's cues |
| `setCueVolume(volume)` / `setCuesMuted(muted)` | The cues' own volume and mute |
| `updateMixer(mixer)` | Update mixer levels, mute, and solo state |
| `destroy()` | Tear down the engine and close the audio context |

### Types

```ts
import type {
  Note,
  Waveform,              // 'sine' | 'square' | 'sawtooth' | 'triangle'
  FilterType,            // 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'none'
  EnvelopeCurve,         // 'linear' | 'exponential'
  LfoTarget,             // 'filter' | 'pitch'
  InstrumentParams,
  InstrumentPreset,
  Track,
  TrackMixerState,
  MixerState,
  SoundscapeMetadata,
  SoundscapeState,
  PlaybackState,
  VoiceParams,
  EffectsParams,
} from 'soundscape-engine';
```

### Factory Functions

| Function | Description |
|----------|-------------|
| `createNote(overrides?)` | Create a `Note` with sensible defaults |
| `createTrack(overrides?)` | Create a `Track` with sensible defaults |
| `createMixerState(tracks)` | Build a `MixerState` from an array of tracks |
| `defaultInstrumentParams` | Default `InstrumentParams` values |
| `defaultTrackMixerState` | Default `TrackMixerState` values |
| `defaultMetadata` | Default `SoundscapeMetadata` values |

### Built-in Presets

Eleven presets are included out of the box:

| Preset | Waveform | Character |
|--------|----------|-----------|
| `bass` | sawtooth | Deep, filtered bass |
| `lead` | square | Bright lead with delay and unison |
| `pad` | sine | Soft, sustained pad with reverb |
| `keys` | triangle | Snappy keyboard |
| `pluck` | sawtooth | Short, resonant pluck |
| `percussion` | square | Punchy percussion hit |
| `piano` | triangle | Natural piano character |
| `organ` | sine | Sustained organ with slight distortion |
| `strings` | sawtooth | Slow-attack strings with reverb and unison |
| `bell` | triangle | Bright bell with delay and reverb |
| `marimba` | triangle | Quick-decay mallet sound |

Access them via `builtInPresets` or individually (`bassPreset`, `leadPreset`, etc.). Look up a preset by ID with `getPresetById(presets, id)`.

### Utility Functions

**Pitch**

- `midiToFrequency(midi)` — MIDI note number to Hz
- `frequencyToMidi(hz)` — Hz to MIDI note number
- `midiToNoteName(midi)` — MIDI note number to name (e.g. `60` → `"C4"`)
- `applyPitchOffset(midi, semitones)` — Transpose a MIDI note
- `normalizedToFilterFreq(n)` — Map 0–1 to 20 Hz–20 kHz (exponential)
- `normalizedToQ(n)` — Map 0–1 to filter Q 0.5–20

**Time**

- `beatsToSeconds(beats, bpm)` — Convert beats to seconds
- `secondsToBeats(seconds, bpm)` — Convert seconds to beats
- `normalizedToADSR(n, type)` — Map 0–1 to ADSR seconds
- `normalizedToDelayTime(n)` — Map 0–1 to delay time in seconds
- `formatTime(seconds)` — Format as `mm:ss.ms`
- `formatBeats(beats, beatsPerBar?)` — Format as `bar.beat`

**Validation**

- `validateSoundscapeState(state)` — Type-guard that validates a `SoundscapeState`
- `soundscapeInstrumentProblems(state)` - Where a state's instruments break the
  0.4.0 rules or carry a field only a cue can have, such as `decayUntilRelease`:
  each problem with the path to the bad value, like
  `presets[0].params.decayUntilRelease`. `validateSoundscapeState` refuses a
  state with any of them.
- `clamp(value, min, max)` — Clamp a number

## Cues

A cue is a short sound effect: a handful of notes at exact offsets in seconds,
from a JSON document of its own. Every note is scheduled whole on the audio
clock when the cue is played, its start, envelope and stop, and nothing is
ever cancelled, so a cue sounds the same every time and in every browser,
overlaps freely with other cues, and renders offline.

```ts
import { AudioEngine, parseCueDocument } from 'soundscape-engine';

const engine = new AudioEngine();
await engine.initialize();

const parsed = parseCueDocument(await (await fetch('/sounds.cues.json')).text());
if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.path}: ${p.message}`).join('\n'));
engine.loadCues(parsed.document);

engine.playCue('tick');
```

### Cues or `previewNote`

| | Cues | `previewNote` |
|---|---|---|
| Notes | Any number, each at its own offset | One |
| Timing | Every start and release on the audio clock | Released by a 500 ms timer |
| Same every time | Yes | Depends on what the compressor heard last |
| Renders offline | Yes | No: the timer and the render clock never meet |
| Level | Each note's `level`, exactly | Through the 0.3 voice ceiling, 0.8, the master and the compressor |
| Defined in | A cue document | Code, from a preset |

Choose cues for a game's sound effects. `previewNote` is for auditioning a
preset while editing.

### The Document

```json
{
  "format": "soundscape-cues",
  "version": 1,
  "instruments": {
    "click": {
      "waveform": "square",
      "pitchOffset": 0,
      "attack": 0.07418053232275866,
      "decayUntilRelease": true,
      "sustain": 0,
      "release": 0,
      "envelopeCurve": "exponential",
      "envelopeFloor": 0.000018,
      "filterType": "none",
      "filterCutoff": 1,
      "filterResonance": 0,
      "delayTime": 0,
      "delayFeedback": 0,
      "delayMix": 0,
      "distortion": 0,
      "reverbMix": 0,
      "lfoRate": 0,
      "lfoDepth": 0,
      "lfoTarget": "pitch",
      "unisonDetune": 0,
      "velocityResponse": 0
    }
  },
  "cues": {
    "tick": {
      "notes": [
        { "id": "tick", "instrument": "click", "start": 0, "duration": 0.03, "pitch": 81, "level": 0.0216 }
      ]
    }
  }
}
```

- **Instruments are the document's own**, by name, so a cue never depends on
  presets kept elsewhere. Every `InstrumentParams` field is spelled out, so
  nothing falls back to a default. `reverbMix` and `velocityResponse` must be 0:
  the reverb is random, and a note's level replaces velocity.
- **The decay is a fixed length, or it lasts until each note's release.**
  `decay` gives a fixed length. `decayUntilRelease: true`, in its place, runs
  the decay from the end of the attack to the note's release, reaching the
  sustain level there, so one instrument serves notes of any length, each
  fading over its own. An instrument has exactly one of the two: both, or
  neither, is rejected, and so is any value of `decayUntilRelease` but `true`.
  It is for cues alone, which know each note's length when they start it.
- **A note** has a stable `id`, unique in the document; the `instrument` it
  plays; `start` and `duration` in seconds from the cue's start; `pitch` as
  MIDI, fractional allowed; and `level`.
- **`level` is the envelope's peak as a linear gain** on an oscillator whose
  waveform peaks at 1, at the cue output with its volume at 1. A sine at 0.5
  peaks at 0.5, which is -6.02 dBFS. No velocity or ceiling stands in between.
- `parseCueDocument(text)` reads JSON text and also rejects a key repeated in
  one object, which `JSON.parse` would silently resolve. `validateCueDocument`
  checks a parsed object. Both reject rather than repair, and report every
  problem with its path, such as `cues.tick.notes[0].level`.
- `serializeCueDocument(document)` writes the canonical form, so saving an
  unchanged document reproduces its bytes.

### Three Switches, All Opt-In

New optional fields on `InstrumentParams`. Omitted, a voice sounds exactly as
it always has.

- **`envelopeCurve: 'exponential'`** ramps the envelope by a constant ratio. An
  exponential ramp cannot reach or start from zero, so it needs
  **`envelopeFloor`**: the level it starts from, decays to and releases to,
  absolute, in the same units as the peak.
- **`filterType: 'none'`** takes the filter out of the voice entirely. Even the
  most open lowpass moves a click's peak by about 1 dB and lengthens its tail.
- **Cues have their own route**, with `setCueVolume` and `setCuesMuted`, past the
  master gain and the master compressor, which would raise a lone cue by 4 to
  5 dB. Cues still feed the analyser, which passes them through unchanged.

### Offline

Give the engine an `OfflineAudioContext` and play cues at the times the
render should hear them:

```ts
const context = new OfflineAudioContext(1, 48000, 48000);
const engine = new AudioEngine({ context });
await engine.initialize();
engine.loadCues(document);
engine.playCue('tick', 0.1);
const buffer = await context.startRendering();
```

The engine never closes a context it was given.

## Examples

- [Source code](https://github.com/anthony-liddle/soundscape/tree/main/examples)
- [Live demo](https://anthony-liddle.github.io/soundscape/examples/)

## Browser Requirements

Requires a browser with [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) support (all modern browsers).

`AudioEngine.initialize()` must be called in response to a user gesture (click, keypress, etc.) to satisfy browser autoplay policies.

## License

[MIT](./LICENSE)
