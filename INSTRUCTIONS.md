# Integration Instructions

This guide explains how to integrate Soundscape into your web game project to create dynamic, interactive music.

## Live Demo

Visit `/examples/` when running the dev server to see the audio engine in action with playback, tempo control, and sound effects.

## Use Cases

- **Background Music**: Create adaptive soundtracks that respond to game state
- **Sound Effects**: Design synthesized effects for actions and events
- **Music Games**: Build rhythm games or music creation tools
- **Procedural Audio**: Generate music programmatically based on game events

## Integration Options

### Option 1: Standalone Composer Tool

Use Soundscape as a standalone tool to compose music, then export JSON files to load in your game.

1. Run Soundscape locally or deploy it
2. Compose your tracks
3. Export as JSON
4. Load the JSON in your game and use the audio engine

```typescript
import { AudioEngine } from './audio/AudioEngine';
import { builtInPresets } from './presets';

// Load your exported soundscape
const soundscapeData = await fetch('/music/level1.json').then(r => r.json());

// Initialize the audio engine
const engine = new AudioEngine();
await engine.initialize();

// Load the state (add presets since exports don't include them)
const state = {
  ...soundscapeData,
  presets: builtInPresets
};
engine.updateState(state);

// Play the music
engine.play();

// Stop when needed
engine.stop();
```

### Option 2: Embed the Full Editor

Include the full Soundscape editor in your game for user-generated content.

```typescript
import { SoundscapeProvider } from './state';
import { NoteEditor, InstrumentPanel, Transport } from './components';

function GameMusicEditor() {
  return (
    <SoundscapeProvider>
      <Transport />
      <NoteEditor track={selectedTrack} />
      <InstrumentPanel track={selectedTrack} />
    </SoundscapeProvider>
  );
}
```

### Option 3: Audio Engine Only

Use just the audio engine for programmatic music generation.

```typescript
import { AudioEngine } from './audio/AudioEngine';
import { builtInPresets } from './presets';

const engine = new AudioEngine();
await engine.initialize();

// Create a minimal state
engine.updateState({
  metadata: { name: 'Game Music', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
  tracks: [{
    id: 'track1',
    name: 'Melody',
    presetId: 'lead',
    notes: [
      { id: '1', pitch: 60, startTime: 0, duration: 1, velocity: 100 },
      { id: '2', pitch: 64, startTime: 1, duration: 1, velocity: 100 },
      { id: '3', pitch: 67, startTime: 2, duration: 2, velocity: 100 },
    ]
  }],
  presets: builtInPresets,
  mixer: {
    tracks: { track1: { volume: 0.8, mute: false, solo: false, pan: 0 } },
    masterVolume: 0.8
  }
});

engine.play();
```

## API Reference

### AudioEngine

```typescript
class AudioEngine {
  // Initialize the Web Audio context
  initialize(): Promise<void>

  // Resume audio context (required after user interaction)
  resume(): Promise<void>

  // Update the engine with new state
  updateState(state: SoundscapeState): void

  // Playback controls
  play(startBeat?: number): void
  stop(): void

  // Settings
  setTempo(bpm: number): void
  setLoop(enabled: boolean): void

  // Preview a single note
  previewNote(pitch: number, velocity: number, presetId: string, paramOverrides?: Partial<InstrumentParams>): void

  // Subscribe to beat updates
  onBeatUpdate(callback: (beat: number) => void): void

  // Cleanup
  destroy(): void
}
```

### State Structure

```typescript
interface SoundscapeState {
  metadata: {
    name: string;
    tempo: number;           // BPM (40-200)
    timeSignature: [number, number];
    lengthBeats: number;
  };
  tracks: Track[];
  presets: InstrumentPreset[];
  mixer: MixerState;
}

interface Track {
  id: string;
  name: string;
  presetId: string;
  notes: Note[];
  paramOverrides?: Partial<InstrumentParams>;
}

interface Note {
  id: string;
  pitch: number;      // MIDI note number (0-127)
  startTime: number;  // Beat position
  duration: number;   // Length in beats
  velocity: number;   // 0-127
}
```

## Responding to Game Events

### Adaptive Music Example

```typescript
class GameMusicManager {
  private engine: AudioEngine;
  private baseState: SoundscapeState;

  async init() {
    this.engine = new AudioEngine();
    await this.engine.initialize();
    this.baseState = await fetch('/music/base.json').then(r => r.json());
  }

  // Increase tempo during combat
  onCombatStart() {
    this.engine.setTempo(140);
  }

  onCombatEnd() {
    this.engine.setTempo(100);
  }

  // Mute/unmute tracks based on game state
  onEnterDanger() {
    this.engine.updateState({
      ...this.baseState,
      mixer: {
        ...this.baseState.mixer,
        tracks: {
          ...this.baseState.mixer.tracks,
          tensionTrack: { volume: 1, mute: false, solo: false, pan: 0 }
        }
      }
    });
  }

  // Add notes dynamically
  onCollectItem(pitch: number) {
    this.engine.previewNote(pitch, 100, 'keys');
  }
}
```

## Browser Compatibility

Soundscape uses the Web Audio API, which is supported in all modern browsers:
- Chrome 35+
- Firefox 25+
- Safari 14.1+
- Edge 79+

**Important**: Audio context must be resumed after a user interaction (click, tap, keypress) due to browser autoplay policies.

```typescript
document.addEventListener('click', async () => {
  await engine.resume();
}, { once: true });
```

## Performance Tips

1. **Reuse the AudioEngine**: Create one instance and reuse it
2. **Batch state updates**: Combine multiple changes into single `updateState` calls
3. **Limit polyphony**: Too many simultaneous notes can cause audio glitches
4. **Use appropriate release times**: Long releases keep voices active longer

## Troubleshooting

### No sound playing
- Ensure `engine.resume()` is called after user interaction
- Check that the browser tab is focused
- Verify mixer volumes aren't set to 0

### Audio glitches/crackling
- Reduce the number of simultaneous notes
- Lower delay feedback values
- Check CPU usage

### Timing issues
- Use the `onBeatUpdate` callback for synchronization
- Avoid heavy computations in the audio thread
