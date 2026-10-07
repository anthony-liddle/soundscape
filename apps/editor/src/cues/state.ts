import type { CueDocument, CueInstrument, CueNote } from 'soundscape-engine';

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
  /** A copy of `after`, right after it; or, with `after` null, a first note for an empty cue. */
  | { type: 'ADD_NOTE'; cue: string; after: string | null }
  | { type: 'REMOVE_NOTE'; noteId: string }
  /** Several of an instrument's fields as one edit. A field set to undefined is left out. */
  | { type: 'SET_INSTRUMENT'; name: string; changes: Record<string, number | string | boolean | undefined> }
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

/**
 * The next `<cue>-<n>` that no note in the whole document has, since the
 * validator keeps one set of ids across every cue.
 */
export function nextNoteId(doc: CueDocument, cue: string): string {
  const taken = new Set(Object.values(doc.cues).flatMap((c) => c.notes.map((n) => n.id)));
  let n = doc.cues[cue]!.notes.length + 1;
  while (taken.has(`${cue}-${n}`)) n++;
  return `${cue}-${n}`;
}

function withNotes(doc: CueDocument, cue: string, notes: CueNote[]): CueDocument {
  return { ...doc, cues: { ...doc.cues, [cue]: { notes } } };
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

    case 'ADD_NOTE': {
      if (!editor.doc || !Object.prototype.hasOwnProperty.call(editor.doc.cues, action.cue)) return editor;
      const notes = editor.doc.cues[action.cue]!.notes;
      const at = action.after === null ? -1 : notes.findIndex((n) => n.id === action.after);
      const id = nextNoteId(editor.doc, action.cue);
      const source = notes[at];
      const instrument = Object.keys(editor.doc.instruments)[0];
      if (!source && instrument === undefined) return editor;
      // A copy of the note it follows, or for an empty cue a plain A4
      const added: CueNote = source
        ? { ...source, id }
        : { id, instrument: instrument!, start: 0, duration: 0.1, pitch: 69, level: 0.5 };
      const next = [...notes.slice(0, at + 1), added, ...notes.slice(at + 1)];
      return { ...edit(editor, withNotes(editor.doc, action.cue, next)), cue: action.cue, noteId: id };
    }

    case 'REMOVE_NOTE': {
      if (!editor.doc) return editor;
      const cue = cueOf(editor.doc, action.noteId);
      if (cue === undefined) return editor;
      const notes = editor.doc.cues[cue]!.notes;
      const at = notes.findIndex((n) => n.id === action.noteId);
      const next = notes.filter((n) => n.id !== action.noteId);
      // The note after the one removed, or before it when it was the last
      const noteId = (next[at] ?? next[at - 1])?.id ?? null;
      return { ...edit(editor, withNotes(editor.doc, cue, next)), cue, noteId };
    }

    case 'SET_INSTRUMENT': {
      if (!editor.doc) return editor;
      const old = editor.doc.instruments[action.name];
      if (!old) return editor;
      const next: Record<string, unknown> = { ...old };
      for (const [key, value] of Object.entries(action.changes)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      const same =
        Object.keys(next).length === Object.keys(old).length &&
        Object.entries(next).every(([key, value]) => Object.is((old as Record<string, unknown>)[key], value));
      if (same) return editor;
      return edit(editor, {
        ...editor.doc,
        instruments: { ...editor.doc.instruments, [action.name]: next as CueInstrument },
      });
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
