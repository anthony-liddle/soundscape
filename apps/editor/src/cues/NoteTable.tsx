import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { CueDocument, CueProblem } from 'soundscape-engine';
import { ExactField } from './ExactField';
import { dbfs, pitchReadout, storedSeconds } from './readouts';
import { nextNoteId } from './state';
import type { CueAction, NoteField } from './state';

const HARMONICS = [1, 2, 3, 4, 5, 6];
const ADD_ID = 'cue-add-note';

interface NoteTableProps {
  doc: CueDocument;
  cue: string;
  noteId: string | null;
  problems: CueProblem[];
  dispatch: Dispatch<CueAction>;
}

/** One row per note, in the order the file keeps them, every value in a field of its own. */
export function NoteTable({ doc, cue, noteId, problems, dispatch }: NoteTableProps) {
  const notes = doc.cues[cue]!.notes;
  const firstPitch = notes[0]?.pitch ?? 0;
  const problemsAt = (index: number, field: string) =>
    problems.filter((p) => p.path === `cues.${cue}.notes[${index}].${field}`).map((p) => p.message);
  const set = (id: string, field: NoteField, value: number | string) =>
    dispatch({ type: 'SET_NOTE', noteId: id, field, value });

  // Where focus goes once the table has redrawn after an add or a remove
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const selectedNote = notes.find((n) => n.id === noteId) ?? null;
  const add = () => {
    focusNext.current = `${nextNoteId(doc, cue)}-instrument`;
    dispatch({ type: 'ADD_NOTE', cue, after: selectedNote?.id ?? notes[notes.length - 1]?.id ?? null });
  };
  const remove = (index: number) => {
    const neighbour = notes[index + 1] ?? notes[index - 1];
    focusNext.current = neighbour ? `${neighbour.id}-instrument` : ADD_ID;
    dispatch({ type: 'REMOVE_NOTE', noteId: notes[index]!.id });
  };
  const after = selectedNote ?? notes[notes.length - 1];

  return (
    <>
    <div className="cue-table-actions">
      <button
        id={ADD_ID}
        type="button"
        className="btn btn-secondary btn-small"
        aria-label={after ? `Add note after ${after.id}` : 'Add note'}
        onClick={add}
      >
        Add note
      </button>
    </div>
    {notes.length === 0 && <p className="cue-no-notes">This cue has no notes yet.</p>}
    <table className="cue-notes">
      <caption className="visually-hidden">The notes of {cue}, in file order</caption>
      <thead>
        <tr>
          <th scope="col">Note</th>
          <th scope="col">Instrument</th>
          <th scope="col">Start (ms)</th>
          <th scope="col">Duration (ms)</th>
          <th scope="col">Pitch (MIDI)</th>
          <th scope="col">Level (linear)</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {notes.map((note, i) => {
          const selected = note.id === noteId;
          const select = () => {
            if (!selected) dispatch({ type: 'SELECT_NOTE', noteId: note.id });
          };
          return (
            <tr key={note.id} className={selected ? 'cue-note-selected' : undefined} onFocus={select}>
              <th scope="row" data-label="Note">
                <span className="cue-note-marker" aria-hidden="true">
                  {selected ? '▸' : ''}
                </span>
                {note.id}
                {selected && <span className="visually-hidden"> (selected)</span>}
              </th>
              <td data-label="Instrument">
                <select
                  id={`${note.id}-instrument`}
                  className="cue-select"
                  aria-label={`Instrument of ${note.id}`}
                  value={note.instrument}
                  onChange={(e) => set(note.id, 'instrument', e.target.value)}
                >
                  {Object.keys(doc.instruments).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </td>
              <td data-label="Start (ms)">
                <ExactField
                  id={`${note.id}-start`}
                  name={`Start of ${note.id}, in milliseconds`}
                  value={note.start}
                  inMs
                  step={1}
                  bigStep={10}
                  min={0}
                  readout={storedSeconds(note.start)}
                  problems={problemsAt(i, 'start')}
                  onCommit={(v) => set(note.id, 'start', v)}
                />
              </td>
              <td data-label="Duration (ms)">
                <ExactField
                  id={`${note.id}-duration`}
                  name={`Duration of ${note.id}, in milliseconds`}
                  value={note.duration}
                  inMs
                  step={1}
                  bigStep={10}
                  min={1}
                  readout={storedSeconds(note.duration)}
                  problems={problemsAt(i, 'duration')}
                  onCommit={(v) => set(note.id, 'duration', v)}
                />
              </td>
              <td data-label="Pitch (MIDI)">
                <ExactField
                  id={`${note.id}-pitch`}
                  name={`Pitch of ${note.id}, MIDI`}
                  value={note.pitch}
                  step={0.01}
                  bigStep={1}
                  min={0}
                  readout={pitchReadout(note.pitch, firstPitch, i === 0)}
                  problems={problemsAt(i, 'pitch')}
                  onCommit={(v) => set(note.id, 'pitch', v)}
                />
                {i > 0 && (
                  <details id={`${note.id}-harmonics`} className="cue-harmonics">
                    <summary>{'Set to k \u00d7 note 1'}</summary>
                    <div role="group" aria-label={`Multiples of note 1 for ${note.id}`}>
                      {HARMONICS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className="cue-harmonic"
                          aria-label={`Set the pitch of ${note.id} to ${k} \u00d7 note 1`}
                          onClick={() => set(note.id, 'pitch', firstPitch + 12 * Math.log2(k))}
                        >
                          {`${k} \u00d7`}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </td>
              <td data-label="Level (linear)">
                <ExactField
                  id={`${note.id}-level`}
                  name={`Level of ${note.id}, linear`}
                  value={note.level}
                  step={0.001}
                  bigStep={0.01}
                  min={0.001}
                  readout={dbfs(note.level)}
                  problems={problemsAt(i, 'level')}
                  onCommit={(v) => set(note.id, 'level', v)}
                />
              </td>
              <td className="cue-row-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  aria-label={`Remove ${note.id}`}
                  onClick={() => remove(i)}
                >
                  Remove
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}
