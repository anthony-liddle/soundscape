import type { Dispatch } from 'react';
import type { CueDocument } from 'soundscape-engine';
import type { CueAction } from './state';

interface CueListProps {
  doc: CueDocument;
  selected: string | null;
  dispatch: Dispatch<CueAction>;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The document's cues, in file order. The selected one is marked in text, not colour alone. */
export function CueList({ doc, selected, dispatch }: CueListProps) {
  const names = Object.keys(doc.cues);
  return (
    <nav className="cue-list" aria-label="Cues">
      <div className="cue-list-header">
        <h2>Cues</h2>
        <span className="cue-list-count">{names.length}</span>
      </div>
      <ul className="cue-list-items">
        {names.map((name) => {
          const current = name === selected;
          return (
            <li key={name}>
              <button
                type="button"
                className={`cue-list-item ${current ? 'cue-list-item-current' : ''}`}
                aria-current={current ? 'true' : undefined}
                onClick={() => dispatch({ type: 'SELECT_CUE', cue: name })}
              >
                <span className="cue-list-marker" aria-hidden="true">
                  {current ? '▸' : ''}
                </span>
                <span className="cue-list-name">{name}</span>
                <span className="cue-list-meta">{plural(doc.cues[name]!.notes.length, 'note')}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
