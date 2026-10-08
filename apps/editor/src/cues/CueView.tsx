import { useRef } from 'react';
import { Button } from '../components/common';
import { ViewSwitch } from '../components/ViewSwitch';
import type { View } from '../components/ViewSwitch';
import { useViewShortcuts } from '../shortcuts';
import { CueList } from './CueList';
import { NoteTable } from './NoteTable';
import { CueInstrumentPanel } from './CueInstrumentPanel';
import { CueWaveform } from './CueWaveform';
import { playOffReason } from './problems';
import { useCueAudition } from './useCueAudition';
import type { CueEditorApi } from './useCueEditor';
import './CueView.css';

interface CueViewProps {
  cues: CueEditorApi;
  /** In front: its shortcuts are the ones that fire. */
  active: boolean;
  onViewChange: (view: View) => void;
}

/** Edits cue documents: short sound effects, played on the audio clock. Never the song. */
export function CueView({ cues, active, onViewChange }: CueViewProps) {
  const { editor, dispatch, dirty, problems, refused, status, say, openText, save } = cues;
  const { doc } = editor;
  const fileInput = useRef<HTMLInputElement>(null);
  const audition = useCueAudition(say);
  const offReason = playOffReason(problems);

  const playSelected = () => {
    if (!doc || editor.cue === null) say('Open a cue file to play its cues.');
    else if (offReason) say(offReason);
    else void audition.playCue(doc, editor.cue);
  };

  // While this view is in front, its keys never reach the song
  useViewShortcuts(
    {
      togglePlay: playSelected,
      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
      save,
    },
    active
  );

  const selectedInstrument =
    doc && editor.cue !== null ? doc.cues[editor.cue]!.notes.find((n) => n.id === editor.noteId)?.instrument : undefined;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    openText(await file.text(), file.name);
    // So the same file can be opened again
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="app cue-view">
      <header className="app-header">
        <div className="app-header-left">
          <h1>Soundscape</h1>
          <ViewSwitch view="cues" onChange={onViewChange} />
          {doc && (
            <>
              <span className="app-title-separator" aria-hidden="true">/</span>
              <span className="cue-file-name">
                {editor.fileName}
                {dirty && <span className="cue-unsaved"> (unsaved)</span>}
              </span>
            </>
          )}
        </div>
        <div className="app-header-right">
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            aria-label="Cue file to open"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Open
          </Button>
          <Button variant="primary" onClick={save} disabled={!doc}>
            Save
          </Button>
        </div>
      </header>

      {refused && (
        <section className="cue-panel cue-refused" role="alert">
          <h2>{refused.fileName} was not opened</h2>
          <ul>
            {refused.problems.map((p, i) => (
              <li key={i}>
                <code>{p.path || '(document)'}</code> {p.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc ? (
        <div className="app-content">
          <aside className="app-sidebar">
            <CueList doc={doc} selected={editor.cue} problems={problems} dispatch={dispatch} />
          </aside>
          <main className="app-main cue-main">
            <section className="cue-panel" aria-labelledby="cue-notes-heading">
              <div className="cue-toolbar">
                <h2 id="cue-notes-heading">{editor.cue}</h2>
                <button
                  type="button"
                  className="btn btn-primary btn-medium"
                  aria-label={`Play ${editor.cue}`}
                  aria-describedby={offReason ? 'cue-play-off' : undefined}
                  disabled={offReason !== null}
                  onClick={playSelected}
                >
                  Play
                </button>
                {offReason && (
                  <p id="cue-play-off" className="cue-play-off">
                    <span aria-hidden="true">! </span>
                    {offReason}
                  </p>
                )}
              </div>
              <CueWaveform doc={doc} cue={editor.cue!} valid={offReason === null} />
              <NoteTable
                doc={doc}
                cue={editor.cue!}
                noteId={editor.noteId}
                problems={problems}
                dispatch={dispatch}
                onPlayNote={(note) => void audition.playNote(doc, note)}
                playOffId={offReason ? 'cue-play-off' : null}
              />
            </section>
            {selectedInstrument !== undefined && (
              <CueInstrumentPanel doc={doc} name={selectedInstrument} problems={problems} dispatch={dispatch} />
            )}
          </main>
        </div>
      ) : (
        <main className="cue-empty">
          <p>Open a cue file to edit its cues.</p>
        </main>
      )}

      <p className="cue-status" role="status">
        {status}
      </p>
    </div>
  );
}
