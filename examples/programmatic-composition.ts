/**
 * Programmatic Composition Example
 *
 * Demonstrates how to create music entirely in code without using the editor.
 * Useful for procedurally generated music or dynamic compositions.
 */

import { AudioEngine } from '../src/audio/AudioEngine';
import { builtInPresets } from '../src/presets';
import type { SoundscapeState, Track, Note } from '../src/types';

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a unique ID for notes and tracks.
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Create a note object.
 */
function createNote(
  pitch: number,
  startTime: number,
  duration: number = 1,
  velocity: number = 100
): Note {
  return {
    id: generateId(),
    pitch,
    startTime,
    duration,
    velocity,
  };
}

/**
 * Create a track object.
 */
function createTrack(name: string, presetId: string, notes: Note[] = []): Track {
  return {
    id: generateId(),
    name,
    presetId,
    notes,
  };
}

/**
 * Convert a scale degree to MIDI pitch.
 * @param degree - Scale degree (1-7)
 * @param octave - Octave number (4 = middle C)
 * @param scale - Scale intervals from root
 */
function scaleDegreeToMidi(
  degree: number,
  octave: number = 4,
  scale: number[] = [0, 2, 4, 5, 7, 9, 11] // Major scale
): number {
  const rootMidi = 12 * (octave + 1); // C of the octave
  const index = ((degree - 1) % 7 + 7) % 7;
  const octaveOffset = Math.floor((degree - 1) / 7);
  return rootMidi + scale[index] + octaveOffset * 12;
}

// ============================================
// Music Generation
// ============================================

/**
 * Generate a simple bass line.
 */
function generateBassLine(length: number, root: number = 36): Note[] {
  const notes: Note[] = [];
  const pattern = [0, 0, 7, 5]; // Root, root, fifth, fourth

  for (let beat = 0; beat < length; beat += 4) {
    pattern.forEach((interval, i) => {
      if (beat + i < length) {
        notes.push(createNote(root + interval, beat + i, 1, 90));
      }
    });
  }

  return notes;
}

/**
 * Generate a random melody within a scale.
 */
function generateMelody(length: number, octave: number = 5): Note[] {
  const notes: Note[] = [];
  const scale = [0, 2, 4, 5, 7, 9, 11]; // C major
  const rootMidi = 12 * (octave + 1);

  let beat = 0;
  while (beat < length) {
    const pitch = rootMidi + scale[Math.floor(Math.random() * scale.length)];
    const duration = Math.random() > 0.7 ? 2 : 1;
    const velocity = 70 + Math.floor(Math.random() * 40);

    notes.push(createNote(pitch, beat, duration, velocity));
    beat += duration;
  }

  return notes;
}

/**
 * Generate chord pads.
 */
function generateChords(length: number): Note[] {
  const notes: Note[] = [];
  const chords = [
    [48, 52, 55], // C major
    [50, 53, 57], // D minor
    [52, 55, 59], // E minor
    [48, 52, 55], // C major
  ];

  for (let beat = 0; beat < length; beat += 4) {
    const chord = chords[(beat / 4) % chords.length];
    chord.forEach((pitch) => {
      notes.push(createNote(pitch, beat, 4, 50));
    });
  }

  return notes;
}

/**
 * Generate a simple drum pattern using the percussion preset.
 */
function generateDrums(length: number): Note[] {
  const notes: Note[] = [];
  const kick = 36;
  const snare = 40;
  const hihat = 44;

  for (let beat = 0; beat < length; beat++) {
    // Kick on 1 and 3
    if (beat % 4 === 0 || beat % 4 === 2) {
      notes.push(createNote(kick, beat, 0.5, 100));
    }
    // Snare on 2 and 4
    if (beat % 4 === 1 || beat % 4 === 3) {
      notes.push(createNote(snare, beat, 0.5, 90));
    }
    // Hi-hat on every beat
    notes.push(createNote(hihat, beat, 0.25, 60));
  }

  return notes;
}

// ============================================
// Main Composition Function
// ============================================

/**
 * Create a complete procedurally generated soundscape.
 */
function createProceduralSoundscape(lengthBeats: number = 16): SoundscapeState {
  const bassTrack = createTrack('Bass', 'bass', generateBassLine(lengthBeats));
  const melodyTrack = createTrack('Melody', 'lead', generateMelody(lengthBeats));
  const padTrack = createTrack('Chords', 'pad', generateChords(lengthBeats));
  const drumTrack = createTrack('Drums', 'percussion', generateDrums(lengthBeats));

  return {
    metadata: {
      name: 'Procedural Composition',
      tempo: 110,
      timeSignature: [4, 4],
      lengthBeats,
    },
    tracks: [bassTrack, melodyTrack, padTrack, drumTrack],
    presets: builtInPresets,
    mixer: {
      tracks: {
        [bassTrack.id]: { volume: 0.7, mute: false, solo: false, pan: 0 },
        [melodyTrack.id]: { volume: 0.8, mute: false, solo: false, pan: 0 },
        [padTrack.id]: { volume: 0.4, mute: false, solo: false, pan: 0 },
        [drumTrack.id]: { volume: 0.6, mute: false, solo: false, pan: 0 },
      },
      masterVolume: 0.8,
    },
  };
}

// ============================================
// Usage Example
// ============================================

async function main() {
  const engine = new AudioEngine();
  await engine.initialize();

  // Generate a new composition
  const soundscape = createProceduralSoundscape(16);
  engine.updateState(soundscape);
  engine.setLoop(true);

  console.log('Generated soundscape:', soundscape.metadata.name);
  console.log('Tracks:', soundscape.tracks.map((t) => t.name).join(', '));

  // Play on click
  document.addEventListener('click', async () => {
    await engine.resume();
    engine.play();
    console.log('Playing procedural composition');
  }, { once: true });

  // Generate new composition on spacebar
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      const newSoundscape = createProceduralSoundscape(16);
      engine.updateState(newSoundscape);
      console.log('Generated new composition');
    }
  });
}

document.addEventListener('DOMContentLoaded', main);

export {
  createNote,
  createTrack,
  scaleDegreeToMidi,
  generateBassLine,
  generateMelody,
  generateChords,
  generateDrums,
  createProceduralSoundscape,
};
