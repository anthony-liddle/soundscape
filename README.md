# Soundscape

A browser-based music sequencer and synthesizer built with React, TypeScript, and the Web Audio API.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

## Features

### Sequencer
- **Piano Roll Editor**: 2-octave grid (C3-C5) for composing melodies
- **16-Beat Timeline**: Click cells to add/remove notes
- **Playback Indicator**: Visual column highlight shows current beat during playback
- **Multiple Tracks**: Create and manage multiple instrument tracks

### Synthesizer
- **Oscillator**: Choose from sine, square, sawtooth, and triangle waveforms with pitch offset control
- **ADSR Envelope**: Full control over Attack, Decay, Sustain, and Release
- **Filter**: Low-pass filter with cutoff and resonance controls
- **Delay Effect**: Configurable time, feedback, and mix
- **Distortion**: Add grit and harmonic content
- **Velocity Response**: Control how note velocity affects sound

### Mixer
- **Per-Track Volume**: Individual volume faders for each track
- **Mute/Solo**: M and S buttons for each track
- **Master Volume**: Global output level control
- **Track Selection**: Visual indication of selected track

### Project Management
- **Custom Naming**: Edit soundscape and track names inline
- **Import/Export**: Save and load projects as JSON files
- **Preset System**: Built-in instrument presets (Bass, Lead, Pad, Keys, Pluck, Percussion)

## Getting Started

### Install dependencies
```bash
npm install
# or
pnpm install
```

### Run development server
```bash
npm run dev
# or
pnpm dev
```

### Build for production
```bash
npm run build
# or
pnpm build
```

## Usage

1. **Create a track**: Click "+ Add Track" in the Tracks panel
2. **Select a preset**: Use the dropdown to choose an instrument sound
3. **Add notes**: Click cells in the piano roll to place notes
4. **Adjust sound**: Modify parameters in the Instrument panel (hover labels for tooltips)
5. **Mix**: Use the Mixer to balance track volumes
6. **Play**: Hit the Play button to hear your composition
7. **Export**: Save your work with the Export button

## Integration

Want to use Soundscape in your web game or application? See the **[Integration Instructions](INSTRUCTIONS.md)** for detailed guidance on:

- Using Soundscape as a standalone composer tool
- Embedding the editor in your project
- Using the audio engine programmatically
- Responding to game events with adaptive music

**Live Demo**: Visit `/examples/` when running the dev server to try an interactive demo.

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

```
src/
├── components/
│   ├── common/          # Reusable UI components (Button, Slider, Select)
│   ├── Transport/       # Play/Stop controls and tempo
│   ├── TrackList/       # Track management sidebar
│   ├── NoteEditor/      # Piano roll grid
│   ├── InstrumentPanel/ # Synth parameter controls
│   ├── Mixer/           # Volume and mute/solo controls
│   └── ImportExport/    # Save/load functionality
├── audio/               # Web Audio engine and synthesis
├── state/               # React context and reducer
├── types/               # TypeScript type definitions
├── presets/             # Built-in instrument presets
└── utils/               # Helper functions
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
