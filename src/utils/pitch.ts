// A4 = 440Hz = MIDI note 69
const A4_FREQUENCY = 440;
const A4_MIDI = 69;

/**
 * Convert MIDI note number to frequency in Hz
 */
export function midiToFrequency(midiNote: number): number {
  return A4_FREQUENCY * Math.pow(2, (midiNote - A4_MIDI) / 12);
}

/**
 * Convert frequency to MIDI note number (rounded)
 */
export function frequencyToMidi(frequency: number): number {
  return Math.round(12 * Math.log2(frequency / A4_FREQUENCY) + A4_MIDI);
}

/**
 * Get note name from MIDI number (e.g., 60 -> "C4")
 */
export function midiToNoteName(midiNote: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = noteNames[midiNote % 12];
  return `${noteName}${octave}`;
}

/**
 * Apply semitone offset to a MIDI pitch
 */
export function applyPitchOffset(midiNote: number, semitones: number): number {
  return midiNote + semitones;
}

/**
 * Map normalized filter cutoff (0-1) to frequency (20Hz - 20kHz)
 */
export function normalizedToFilterFreq(normalized: number): number {
  const minFreq = 20;
  const maxFreq = 20000;
  // Exponential mapping for more musical control
  return minFreq * Math.pow(maxFreq / minFreq, normalized);
}

/**
 * Map normalized resonance (0-1) to Q value (0.5 - 20)
 */
export function normalizedToQ(normalized: number): number {
  const minQ = 0.5;
  const maxQ = 20;
  return minQ + normalized * (maxQ - minQ);
}
