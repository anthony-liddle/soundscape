export interface Note {
  id: string;
  pitch: number; // MIDI pitch 0-127
  startTime: number; // in beats
  duration: number; // in beats
  velocity: number; // 0-127
}

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
