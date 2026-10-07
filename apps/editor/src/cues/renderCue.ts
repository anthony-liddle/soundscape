import { AudioEngine, normalizedToADSR } from 'soundscape-engine';
import type { CueDocument } from 'soundscape-engine';

export const RENDER_RATE = 48000;

/** Seconds from the cue's start until its last note has finished releasing. Zero for an empty cue. */
export function cueLength(doc: CueDocument, cue: string): number {
  let end = 0;
  for (const note of doc.cues[cue]!.notes) {
    const release = normalizedToADSR(doc.instruments[note.instrument]!.release, 'release');
    end = Math.max(end, note.start + note.duration + release);
  }
  return end;
}

/** The cue rendered offline through the cue path, as a game would play it. */
export async function renderCue(doc: CueDocument, cue: string): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(cueLength(doc, cue) * RENDER_RATE));
  const context = new OfflineAudioContext(1, length, RENDER_RATE);
  const engine = new AudioEngine({ context });
  try {
    await engine.initialize();
    engine.loadCues(doc);
    engine.playCue(cue, 0);
    return await context.startRendering();
  } finally {
    engine.destroy();
  }
}

export function peakOf(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  return peak;
}
