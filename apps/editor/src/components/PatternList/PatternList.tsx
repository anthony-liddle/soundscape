import { useState } from 'react';
import { useSoundscape } from '../../state';
import type { Pattern } from 'soundscape-engine';
import './PatternList.css';

interface PatternListProps {
  activePatternId: string | null;
  onPatternSelect: (patternId: string) => void;
}

export function PatternList({ activePatternId, onPatternSelect }: PatternListProps) {
  const { state, dispatch } = useSoundscape();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAdd = () => {
    dispatch({
      type: 'ADD_PATTERN',
      payload: { name: `Pattern ${state.patterns.length + 1}`, lengthBeats: 16 },
    });
  };

  const handleStartRename = (patternId: string, currentName: string) => {
    setEditingId(patternId);
    setEditingName(currentName);
  };

  const handleConfirmRename = (patternId: string) => {
    const name = editingName.trim();
    if (name) dispatch({ type: 'RENAME_PATTERN', payload: { patternId, name } });
    setEditingId(null);
  };

  const handleDuplicate = (patternId: string) => {
    dispatch({ type: 'DUPLICATE_PATTERN', payload: { patternId } });
  };

  const handleDelete = (patternId: string) => {
    if (patternId === activePatternId) {
      const remaining = state.patterns.find((p) => p.id !== patternId);
      if (remaining) onPatternSelect(remaining.id);
    }
    dispatch({ type: 'REMOVE_PATTERN', payload: { patternId } });
  };

  return (
    <div className="pattern-list">
      <div className="pattern-list__header">
        <span className="pattern-list__title">Patterns</span>
        <button className="pattern-list__add-btn" onClick={handleAdd} title="New pattern">+</button>
      </div>
      <div className="pattern-list__hint">
        Select a pattern to edit it. Click the timeline to place it.
      </div>
      <ul className="pattern-list__items">
        {state.patterns.map((pattern: Pattern) => (
          <li
            key={pattern.id}
            className={`pattern-list__item${pattern.id === activePatternId ? ' pattern-list__item--active' : ''}`}
            onClick={() => onPatternSelect(pattern.id)}
          >
            {editingId === pattern.id ? (
              <input
                className="pattern-list__rename-input"
                value={editingName}
                autoFocus
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleConfirmRename(pattern.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename(pattern.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="pattern-list__item-name">{pattern.name}</span>
                <span className="pattern-list__item-meta">{pattern.lengthBeats}b</span>
                <button
                  className="pattern-list__action-btn"
                  onClick={(e) => { e.stopPropagation(); handleStartRename(pattern.id, pattern.name); }}
                  title="Rename"
                >✎</button>
                <button
                  className="pattern-list__action-btn"
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(pattern.id); }}
                  title="Duplicate"
                >⧉</button>
                <button
                  className="pattern-list__action-btn pattern-list__action-btn--delete"
                  disabled={state.patterns.length <= 1}
                  onClick={(e) => { e.stopPropagation(); handleDelete(pattern.id); }}
                  title="Delete"
                >×</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
