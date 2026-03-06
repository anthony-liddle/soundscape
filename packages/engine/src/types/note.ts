/** A single note event placed on a track's timeline. */
export interface Note {
  /** Unique identifier for this note. */
  id: string;
  /** MIDI pitch value (0–127). Middle C is 60. */
  pitch: number;
  /** Beat position where the note begins (0-based). */
  startTime: number;
  /** Length of the note in beats. */
  duration: number;
  /** Note velocity / intensity (0–127). Higher values produce louder output when `velocityResponse > 0`. */
  velocity: number;
}

/**
 * Factory helper that creates a {@link Note} with a generated `id`.
 *
 * @param pitch - MIDI pitch (0–127). Middle C = 60.
 * @param startTime - Beat position where the note begins (0-based).
 * @param duration - Length of the note in beats. Defaults to `1`.
 * @param velocity - Note velocity (0–127). Defaults to `100`.
 * @returns A new {@link Note} object.
 *
 * @example
 * // Quarter-note middle C at beat 0, full velocity
 * const note = createNote(60, 0, 1, 127);
 */
export function createNote(
  pitch: number,
  startTime: number,
  duration: number = 1,
  velocity: number = 100
): Note {
  return {
    id: crypto.randomUUID(),
    pitch,
    startTime,
    duration,
    velocity,
  };
}
