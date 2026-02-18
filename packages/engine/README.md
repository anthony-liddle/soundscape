# soundscape-engine

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
| `onBeatUpdate(cb)` | Register a callback that fires each scheduling tick |
| `previewNote(pitch, velocity, presetId, overrides?)` | Audition a single note |
| `updateMixer(mixer)` | Update mixer levels, mute, and solo state |
| `destroy()` | Tear down the engine and close the audio context |

### Types

```ts
import type {
  Note,
  Waveform,              // 'sine' | 'square' | 'sawtooth' | 'triangle'
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

Six presets are included out of the box:

| Preset | Waveform | Character |
|--------|----------|-----------|
| `bass` | sawtooth | Deep, filtered bass |
| `lead` | square | Bright lead with delay |
| `pad` | sine | Soft, sustained pad |
| `keys` | triangle | Snappy keyboard |
| `pluck` | sawtooth | Short, resonant pluck |
| `percussion` | square | Punchy percussion hit |

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
- `clamp(value, min, max)` — Clamp a number

## Examples

- [Source code](https://github.com/anthony-liddle/soundscape/tree/main/examples)
- [Live demo](https://anthony-liddle.github.io/soundscape/examples/)

## Browser Requirements

Requires a browser with [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) support (all modern browsers).

`AudioEngine.initialize()` must be called in response to a user gesture (click, keypress, etc.) to satisfy browser autoplay policies.

## License

[MIT](./LICENSE)
