import { useEffect, useRef, useState } from 'react';
import type { CueDocument } from 'soundscape-engine';
import { cueLength, peakOf, renderCue } from './renderCue';
import { dbfs } from './readouts';

interface CueWaveformProps {
  doc: CueDocument;
  cue: string;
  /** Whether the document has no problems, so the engine will load it. */
  valid: boolean;
}

interface Drawing {
  doc: CueDocument;
  cue: string;
  label: string;
}

const WIDTH = 1200;
const HEIGHT = 160;

/** Min and max of each column, scaled to the cue's own peak, about a centre line. */
function draw(canvas: HTMLCanvasElement | null, buffer: AudioBuffer, peak: number): void {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const data = buffer.getChannelData(0);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#374151';
  ctx.fillRect(0, HEIGHT / 2, WIDTH, 1);
  ctx.fillStyle = '#60a5fa';
  const perColumn = data.length / WIDTH;
  const scale = peak > 0 ? (HEIGHT / 2 - 2) / peak : 0;
  for (let x = 0; x < WIDTH; x++) {
    let low = 0;
    let high = 0;
    const end = Math.min(data.length, Math.floor((x + 1) * perColumn));
    for (let i = Math.floor(x * perColumn); i < end; i++) {
      low = Math.min(low, data[i]!);
      high = Math.max(high, data[i]!);
    }
    ctx.fillRect(x, HEIGHT / 2 - high * scale, 1, Math.max(1, (high - low) * scale));
  }
}

/**
 * The selected cue, rendered offline and drawn after every committed edit,
 * with its length and peak in text, so the picture is never the only account.
 */
export function CueWaveform({ doc, cue, valid }: CueWaveformProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const canRender = typeof OfflineAudioContext !== 'undefined';
  const empty = doc.cues[cue]!.notes.length === 0;

  useEffect(() => {
    if (!canRender || !valid || empty) return;
    let gone = false;
    renderCue(doc, cue).then(
      (buffer) => {
        if (gone) return;
        const peak = peakOf(buffer);
        draw(canvas.current, buffer, peak);
        setFailure(null);
        setDrawing({ doc, cue, label: `length ${Math.round(cueLength(doc, cue) * 1000)} ms, peak ${dbfs(peak)}` });
      },
      (error: unknown) => {
        if (!gone) setFailure(error instanceof Error ? error.message : String(error));
      }
    );
    return () => {
      gone = true;
    };
  }, [doc, cue, valid, canRender, empty]);

  const current = drawing && drawing.doc === doc && drawing.cue === cue ? drawing.label : null;
  const message = !canRender
    ? 'Not drawn: this browser cannot render offline.'
    : !valid
      ? 'Not drawn until the problems are fixed.'
      : empty
        ? 'No notes to draw.'
        : failure
          ? `Not drawn: ${failure}`
          : current
            ? `${current[0]!.toUpperCase()}${current.slice(1)}`
            : 'Drawing';
  const showPicture = canRender && valid && !empty && current !== null;

  return (
    <figure className="cue-waveform">
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        hidden={!showPicture}
        role="img"
        aria-label={showPicture ? `${cue}: ${current}` : undefined}
      />
      <figcaption className="cue-waveform-label">{message}</figcaption>
    </figure>
  );
}
