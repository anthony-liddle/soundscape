# Soundscape Examples

This directory contains example code demonstrating how to integrate Soundscape into your projects.

## Live Demo

When running the dev server (`npm run dev` or `pnpm dev`), visit **`/examples/`** in your browser to try an interactive demo featuring:

- Playback with beat visualization
- Tempo control
- Sound effects

The live demo is also available in production builds.

## Code Examples

### 1. Basic Playback (`basic-playback.ts`)
The simplest example - load an exported soundscape JSON and play it. Includes a `BasicMusicPlayer` class you can copy into your project.

### 2. Programmatic Composition (`programmatic-composition.ts`)
Create music entirely in code without using the editor. Includes helper functions for:
- Generating bass lines
- Creating random melodies
- Building chord progressions
- Programming drum patterns

### 3. Adaptive Game Music (`adaptive-game-music.ts`)
A complete `GameMusicManager` class that responds to game events:
- Game state changes (explore, combat, boss, victory, gameover)
- Dynamic tempo adjustment
- Track muting/unmuting
- One-shot sound effects

### 4. Sample Soundscape (`sample-soundscape.json`)
A pre-made 3-track composition (bass, melody, pad) you can use for testing.

## Using the Examples

These examples are written in TypeScript and designed to be integrated into a project that includes Soundscape.

### Quick Start

```typescript
// Import from your Soundscape installation
import { AudioEngine } from 'soundscape/audio/AudioEngine';
import { builtInPresets } from 'soundscape/presets';

// Initialize
const engine = new AudioEngine();
await engine.initialize();

// Load a soundscape (exported from the editor)
const data = await fetch('/music/my-song.json').then(r => r.json());
engine.updateState({ ...data, presets: builtInPresets });

// Play after user interaction
document.addEventListener('click', async () => {
  await engine.resume();
  engine.play();
}, { once: true });
```

### Copying Examples to Your Project

1. Copy the relevant `.ts` file into your project
2. Adjust import paths to match your project structure
3. Ensure you have the Soundscape `src/audio` and `src/presets` directories available

## File Structure

```
examples/
├── README.md                    # This file
├── basic-playback.ts            # Simple playback example
├── programmatic-composition.ts  # Generate music in code
├── adaptive-game-music.ts       # Game music manager
└── sample-soundscape.json       # Sample composition

public/examples/
├── index.html                   # Live interactive demo
└── sample-soundscape.json       # Sample composition for demo
```

## Browser Requirements

All examples require a modern browser with Web Audio API support:
- Chrome 35+
- Firefox 25+
- Safari 14.1+
- Edge 79+

**Important**: Audio playback must be initiated after a user interaction (click, tap, or keypress) due to browser autoplay policies.
