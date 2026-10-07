import { useCallback, useMemo, useReducer, useState } from 'react';
import type { Dispatch } from 'react';
import { parseCueDocument, validateCueDocument } from 'soundscape-engine';
import type { CueProblem } from 'soundscape-engine';
import { cueReducer, initialCueEditor, isDirty } from './state';
import type { CueAction, CueEditor } from './state';
import { downloadCueDocument } from './cueFile';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

/** A file that was refused, and every reason why, each with its path. */
export interface RefusedFile {
  fileName: string;
  problems: CueProblem[];
}

export interface CueEditorApi {
  editor: CueEditor;
  dispatch: Dispatch<CueAction>;
  dirty: boolean;
  /** Problems in the open document, as edits leave it. Empty while it is valid. */
  problems: CueProblem[];
  refused: RefusedFile | null;
  status: string;
  say: (status: string) => void;
  /** Opens a cue file from its text. False when the person chose to keep unsaved edits. */
  openText: (text: string, fileName: string) => boolean;
  save: () => void;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * The cue view's document, history and file handling. It lives with the app
 * rather than the view, so the song's Import can hand it a file before the
 * Cues view has ever been shown.
 */
export function useCueEditor(): CueEditorApi {
  const [editor, dispatch] = useReducer(cueReducer, undefined, initialCueEditor);
  const [refused, setRefused] = useState<RefusedFile | null>(null);
  const [status, say] = useState('');
  const dirty = isDirty(editor);
  useUnsavedChangesGuard(dirty);

  const problems = useMemo(() => {
    if (!editor.doc) return [];
    const result = validateCueDocument(editor.doc);
    return result.ok ? [] : result.problems;
  }, [editor.doc]);

  const openText = useCallback(
    (text: string, fileName: string) => {
      if (dirty && !confirm(`Discard the unsaved changes to ${editor.fileName}?`)) return false;
      // Parsed here, from the text, never with JSON.parse, so a key repeated
      // in one object is caught
      const parsed = parseCueDocument(text);
      if (!parsed.ok) {
        setRefused({ fileName, problems: parsed.problems });
        say(`${fileName} was not opened.`);
        return true;
      }
      setRefused(null);
      dispatch({ type: 'OPEN', doc: parsed.document, fileName });
      say(`Opened ${fileName}: ${plural(Object.keys(parsed.document.cues).length, 'cue')}.`);
      return true;
    },
    [dirty, editor.fileName]
  );

  const save = useCallback(() => {
    if (!editor.doc) {
      say('Nothing to save: no cue file is open.');
      return;
    }
    if (problems.length > 0) {
      // A file with problems could not be opened again, here or in a game
      say(`Not saved: fix the ${plural(problems.length, 'problem')} first, so the file opens again.`);
      return;
    }
    downloadCueDocument(editor.doc, editor.fileName);
    dispatch({ type: 'SAVED' });
    say(`Saved ${editor.fileName}.`);
  }, [editor.doc, editor.fileName, problems.length]);

  return { editor, dispatch, dirty, problems, refused, status, say, openText, save };
}
