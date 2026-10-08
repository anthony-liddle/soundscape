import { useCallback, useEffect, useRef } from 'react';
import { AudioEngine } from 'soundscape-engine';
import type { CueDocument, CueNote } from 'soundscape-engine';

/**
 * The Cues view's own engine, made on the first Play, so an editor that never
 * plays a cue never opens a second audio context. Everything plays through
 * the cue path: loadCues, then playCue. Never previewNote.
 */
export function useCueAudition(say: (status: string) => void) {
  const engine = useRef<Promise<AudioEngine> | null>(null);

  useEffect(
    () => () => {
      void engine.current?.then((e) => e.destroy());
      engine.current = null;
    },
    []
  );

  const ready = () => {
    engine.current ??= (async () => {
      const e = new AudioEngine();
      await e.initialize();
      return e;
    })();
    return engine.current;
  };

  const play = useCallback(
    async (doc: CueDocument, name: string, what: string) => {
      try {
        const e = await ready();
        // A suspended context keeps what is scheduled until it runs, so the
        // cue need not wait for resume, which never settles where there is no
        // audio output, as on a headless Linux runner
        e.resume().catch(() => {});
        e.loadCues(doc);
        e.playCue(name);
        say(`Played ${what}.`);
      } catch (error) {
        say(`Could not play ${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [say]
  );

  const playCue = useCallback((doc: CueDocument, name: string) => play(doc, name, name), [play]);

  /** One note alone: a document holding only that note, at the start, and its instrument. */
  const playNote = useCallback(
    (doc: CueDocument, note: CueNote) =>
      play(
        {
          format: doc.format,
          version: doc.version,
          instruments: { [note.instrument]: doc.instruments[note.instrument]! },
          cues: { audition: { notes: [{ ...note, start: 0 }] } },
        },
        'audition',
        note.id
      ),
    [play]
  );

  return { playCue, playNote };
}
