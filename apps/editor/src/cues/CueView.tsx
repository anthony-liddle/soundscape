import { useRef } from 'react';
import { Button } from '../components/common';
import { ViewSwitch } from '../components/ViewSwitch';
import type { View } from '../components/ViewSwitch';
import { useViewShortcuts } from '../shortcuts';
import { CueList } from './CueList';
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
  const { editor, dispatch, dirty, refused, status, say, openText, save } = cues;
  const { doc } = editor;
  const fileInput = useRef<HTMLInputElement>(null);

  // While this view is in front, its keys never reach the song
  useViewShortcuts(
    {
      togglePlay: () => say(doc ? '' : 'Open a cue file to play its cues.'),
      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
      save,
    },
    active
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    openText(await file.text(), file.name);
    // So the same file can be opened again
    if (fileInput.current) fileInput.current.value = '';
  };

  const notes = doc && editor.cue !== null ? doc.cues[editor.cue]!.notes : [];

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
            <CueList doc={doc} selected={editor.cue} dispatch={dispatch} />
          </aside>
          <main className="app-main">
            <section className="cue-panel" aria-labelledby="cue-notes-heading">
              <h2 id="cue-notes-heading">{editor.cue}</h2>
              <table className="cue-notes">
                <thead>
                  <tr>
                    <th scope="col">Note</th>
                    <th scope="col">Instrument</th>
                    <th scope="col">Start (s)</th>
                    <th scope="col">Duration (s)</th>
                    <th scope="col">Pitch (MIDI)</th>
                    <th scope="col">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={n.id}>
                      <th scope="row">{n.id}</th>
                      <td>{n.instrument}</td>
                      <td>{String(n.start)}</td>
                      <td>{String(n.duration)}</td>
                      <td>{String(n.pitch)}</td>
                      <td>{String(n.level)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
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
