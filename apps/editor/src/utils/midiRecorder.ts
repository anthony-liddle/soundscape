import type { NoteInput } from '../state/reducer';

export interface MidiRecorderOptions {
  /** Quantization grid in beats (e.g. 0.25 = 1/16 notes in 4/4). */
  grid: number;
  loopLengthBeats: number;
}

export interface MidiRecorder {
  noteOn(pitch: number, velocity: number, beat: number): void;
  noteOff(pitch: number, beat: number): void;
  /** Close any still-held notes at `beat` and return all recorded notes. */
  finish(beat: number): NoteInput[];
}

/**
 * Accumulates live MIDI events (stamped with transport beats) into
 * grid-quantized note inputs, ready for a single batched ADD_NOTES dispatch.
 *
 * Off-grid notes render poorly in the piano roll, so starts and durations are
 * always snapped. A note held across the loop wrap is clamped at the loop end.
 */
export function createMidiRecorder({ grid, loopLengthBeats }: MidiRecorderOptions): MidiRecorder {
  const held = new Map<number, { velocity: number; startBeat: number }>();
  const recorded: NoteInput[] = [];

  const snap = (beat: number) => Math.round(beat / grid) * grid;

  function close(pitch: number, endBeat: number): void {
    const note = held.get(pitch);
    if (!note) return;
    held.delete(pitch);

    // Quantize the start, keeping it inside the loop
    const start = Math.min(snap(note.startBeat), loopLengthBeats - grid);

    // A wrapped end beat (loop restarted while the key was held) clamps the
    // note at the loop end
    const end = endBeat < note.startBeat ? loopLengthBeats : snap(endBeat);
    const duration = Math.max(grid, end - start);

    recorded.push({ pitch, startTime: start, duration, velocity: note.velocity });
  }

  return {
    noteOn(pitch, velocity, beat) {
      // Keyboard re-strike: close the previous occurrence first
      if (held.has(pitch)) close(pitch, beat);
      held.set(pitch, { velocity, startBeat: beat });
    },

    noteOff(pitch, beat) {
      close(pitch, beat);
    },

    finish(beat) {
      for (const pitch of [...held.keys()]) {
        close(pitch, beat);
      }
      return [...recorded].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
    },
  };
}
