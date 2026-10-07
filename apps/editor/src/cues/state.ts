import type { CueDocument, CueNote } from 'soundscape-engine';

/**
 * The cue view's state: the open document, what is selected in it, and its
 * own undo history, kept apart from the song's. Selection is not an edit, so
 * it never makes a history entry.
 */
export interface CueEditor {
  doc: CueDocument | null;
  fileName: string;
  /** The selected cue's name. */
  cue: string | null;
  /** The selected note's id. */
  noteId: string | null;
  past: CueDocument[];
  future: CueDocument[];
  /** The document as last opened or saved, to tell whether there are unsaved edits. */
  saved: CueDocument | null;
}

export type NoteField = 'instrument' | 'start' | 'duration' | 'pitch' | 'level';

export type CueAction =
  | { type: 'OPEN'; doc: CueDocument; fileName: string }
  | { type: 'SAVED' }
  | { type: 'SELECT_CUE'; cue: string }
  | { type: 'SELECT_NOTE'; noteId: string }
  | { type: 'SET_NOTE'; noteId: string; field: NoteField; value: number | string }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export const MAX_CUE_HISTORY = 100;

export function initialCueEditor(): CueEditor {
  return { doc: null, fileName: '', cue: null, noteId: null, past: [], future: [], saved: null };
}

export function isDirty(editor: CueEditor): boolean {
  return editor.doc !== editor.saved;
}

/** The cue that holds a note, by the note's id, which is unique in the document. */
function cueOf(doc: CueDocument, noteId: string): string | undefined {
  return Object.keys(doc.cues).find((name) => doc.cues[name]!.notes.some((n) => n.id === noteId));
}

/** Keeps the selection pointing at something that exists in `doc`. */
function select(editor: CueEditor, doc: CueDocument): CueEditor {
  const names = Object.keys(doc.cues);
  const cue = editor.cue !== null && names.includes(editor.cue) ? editor.cue : (names[0] ?? null);
  const notes = cue === null ? [] : doc.cues[cue]!.notes;
  const noteId = notes.some((n) => n.id === editor.noteId) ? editor.noteId : (notes[0]?.id ?? null);
  return { ...editor, doc, cue, noteId };
}

/** Records an edit: the old document goes into the past, and the future is gone. */
function edit(editor: CueEditor, doc: CueDocument): CueEditor {
  if (!editor.doc || doc === editor.doc) return editor;
  return {
    ...editor,
    doc,
    past: [...editor.past, editor.doc].slice(-MAX_CUE_HISTORY),
    future: [],
  };
}

function withNote(doc: CueDocument, noteId: string, change: (note: CueNote) => CueNote): CueDocument {
  const cue = cueOf(doc, noteId);
  if (cue === undefined) return doc;
  return {
    ...doc,
    cues: {
      ...doc.cues,
      [cue]: { notes: doc.cues[cue]!.notes.map((n) => (n.id === noteId ? change(n) : n)) },
    },
  };
}

export function cueReducer(editor: CueEditor, action: CueAction): CueEditor {
  switch (action.type) {
    case 'OPEN':
      return select(
        { ...initialCueEditor(), fileName: action.fileName, saved: action.doc },
        action.doc
      );

    case 'SAVED':
      return { ...editor, saved: editor.doc };

    case 'SELECT_CUE': {
      if (!editor.doc || !Object.prototype.hasOwnProperty.call(editor.doc.cues, action.cue)) return editor;
      const noteId = editor.doc.cues[action.cue]!.notes[0]?.id ?? null;
      return { ...editor, cue: action.cue, noteId };
    }

    case 'SELECT_NOTE': {
      if (!editor.doc) return editor;
      const cue = cueOf(editor.doc, action.noteId);
      return cue === undefined ? editor : { ...editor, cue, noteId: action.noteId };
    }

    case 'SET_NOTE': {
      if (!editor.doc) return editor;
      const { field, value } = action;
      const note = Object.values(editor.doc.cues)
        .flatMap((c) => c.notes)
        .find((n) => n.id === action.noteId);
      if (!note || Object.is(note[field], value)) return editor;
      return edit(editor, withNote(editor.doc, action.noteId, (n) => ({ ...n, [field]: value })));
    }

    case 'UNDO': {
      const previous = editor.past[editor.past.length - 1];
      if (!previous || !editor.doc) return editor;
      return select(
        { ...editor, past: editor.past.slice(0, -1), future: [editor.doc, ...editor.future] },
        previous
      );
    }

    case 'REDO': {
      const [next, ...rest] = editor.future;
      if (!next || !editor.doc) return editor;
      return select({ ...editor, past: [...editor.past, editor.doc], future: rest }, next);
    }
  }
}
