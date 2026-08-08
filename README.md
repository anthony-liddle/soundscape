# Soundscape

A browser-based music sequencer and synthesizer built with React, TypeScript, and the Web Audio API.

**[Try it live](https://anthony-liddle.github.io/soundscape/)**

[![npm](https://img.shields.io/npm/v/soundscape-engine.svg)](https://www.npmjs.com/package/soundscape-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

The audio engine is published standalone as
**[`soundscape-engine`](https://www.npmjs.com/package/soundscape-engine)** — use it
to play compositions without the editor.

## Features

### Sequencer
- **Piano Roll Editor**: 6-octave grid (C1-C7) for composing melodies
- **16-Beat Timeline**: Click cells to add/remove notes, or click and drag to create multi-beat notes
- **Note Selection**: Switch to select mode to drag-select notes, then delete, copy, or paste them
- **Randomize Notes**: Generate random note patterns with one click
- **Playback Indicator**: Visual column highlight shows current beat during playback
- **Live Editing**: Add and remove notes during playback with immediate effect
- **Multiple Tracks**: Create, duplicate, and manage multiple instrument tracks
- **Undo/Redo**: Step back and forward through edit history (Ctrl+Z / Ctrl+Shift+Z)
- **Keyboard Shortcuts**: Space (play/stop), Ctrl+S (export), Ctrl+D (duplicate track)

### Synthesizer
- **Oscillator**: Choose from sine, square, sawtooth, and triangle waveforms with pitch offset and unison detune
- **ADSR Envelope**: Full control over Attack, Decay, Sustain, and Release
- **Filter**: Four filter types (low-pass, high-pass, band-pass, notch) with cutoff and resonance
- **LFO**: Modulate filter cutoff (wah) or pitch (vibrato) with configurable rate and depth
- **Delay Effect**: Configurable time, feedback, and mix
- **Reverb**: Algorithmic room reverb with wet/dry mix control
- **Distortion**: Add grit and harmonic content
- **Velocity Response**: Control how note velocity affects sound
- **Preview**: Audition current instrument settings with one click
- **Randomize Sound**: Generate random instrument parameters for sound exploration

### Visualizer
- **Waveform Display**: Real-time oscilloscope showing the master audio output

### Mixing
- **Per-Track Volume**: Inline horizontal volume slider for each track
- **Mute/Solo**: M and S buttons on each track
- **Master Volume**: Global output level in the transport bar
- **Track Selection**: Visual indication of selected track

### Project Management
- **Custom Naming**: Edit soundscape and track names inline
- **Track Duplication**: Copy a track with all its notes, settings, and volume
- **Import/Export**: Save and load projects as JSON files
- **Preset System**: Built-in instrument presets (Bass, Lead, Pad, Keys, Pluck, Percussion)

## Getting Started

### Using the engine in your project

Install the standalone audio engine from npm:

```bash
npm install soundscape-engine
```

See the [engine package documentation](packages/engine/README.md) for API details.

### Developing the editor

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build all packages
pnpm build
```

## Usage

1. **Create a track**: Click "+ Add Track" in the Tracks panel
2. **Select a preset**: Use the dropdown to choose an instrument sound
3. **Add notes**: Click cells in the piano roll to place notes, or click and drag for multi-beat notes
4. **Adjust sound**: Modify parameters in the Instrument panel (hover labels for tooltips)
5. **Mix**: Adjust per-track volume and mute/solo in the Tracks panel, and master volume in the transport bar
6. **Play**: Hit the Play button to hear your composition
7. **Export**: Save your work with the Export button

## Integration

Want to use Soundscape in your web game or application? See the **[Integration Instructions](INSTRUCTIONS.md)** for detailed guidance on:

- Using Soundscape as a standalone composer tool
- Embedding the editor in your project
- Using the audio engine programmatically
- Responding to game events with adaptive music

**Live Demo**: Try the [interactive examples](https://anthony-liddle.github.io/soundscape/examples/) or run locally with `pnpm dev`.

Check out the **[examples](examples/)** directory for working code samples:
- `basic-playback.ts` - Load and play exported soundscapes
- `programmatic-composition.ts` - Generate music in code
- `adaptive-game-music.ts` - Respond to game events
- `sample-soundscape.json` - Sample composition to test with

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development and building
- **Web Audio API** for sound synthesis
- **CSS** for styling (no external UI library)

## Project Structure

This is a pnpm monorepo:

```
apps/
└── editor/              # React-based sequencer UI
    ├── src/
    │   ├── components/  # UI components (Transport, TrackList, NoteEditor, etc.)
    │   ├── state/       # React context and reducer
    │   ├── api/         # Runtime API for external integration
    │   └── hooks/       # Custom React hooks
    └── public/          # Static assets and examples demo

packages/
└── engine/              # Standalone audio engine (published as soundscape-engine on npm)
    └── src/
        ├── audio/       # AudioEngine, VoiceSynthesizer, EffectsChain
        ├── types/       # TypeScript type definitions
        ├── presets/     # Built-in instrument presets
        └── utils/       # Pitch, time, and validation helpers

examples/                # Integration code samples
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
