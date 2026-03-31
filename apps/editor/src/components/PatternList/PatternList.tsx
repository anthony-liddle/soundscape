// apps/editor/src/components/PatternList/PatternList.tsx
import { useState } from 'react';
import { useSoundscape } from '../../state';
import type { Track } from 'soundscape-engine';
import './PatternList.css';

interface PatternListProps {
  track: Track | null;
  activePatternId: string | null;
  onPatternSelect: (patternId: string) => void;
}

export function PatternList({ track, activePatternId, onPatternSelect }: PatternListProps) {
  const { dispatch } = useSoundscape();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!track) return null;

  const handleAddPattern = () => {
    const name = `Pattern ${track.patterns.length + 1}`;
    dispatch({
      type: 'ADD_PATTERN',
      payload: { trackId: track.id, name, lengthBeats: 16 },
    });
  };

  const handleStartRename = (patternId: string, currentName: string) => {
    setEditingId(patternId);
    setEditingName(currentName);
  };

  const handleConfirmRename = (patternId: string) => {
    const name = editingName.trim();
    if (name) {
      dispatch({
        type: 'RENAME_PATTERN',
        payload: { trackId: track.id, patternId, name },
      });
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (patternId: string) => {
    dispatch({
      type: 'REMOVE_PATTERN',
      payload: { trackId: track.id, patternId },
    });
    // If the deleted pattern was active, select the first remaining pattern
    if (patternId === activePatternId) {
      const remaining = track.patterns.find((p) => p.id !== patternId);
      if (remaining) onPatternSelect(remaining.id);
    }
  };

  return (
    <div className="pattern-list">
      <div className="pattern-list__header">
        <span className="pattern-list__title">Patterns</span>
        <button className="pattern-list__add-btn" onClick={handleAddPattern} title="New pattern">
          +
        </button>
      </div>

      <ul className="pattern-list__items">
        {track.patterns.map((pattern) => (
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
                  if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span
                  className="pattern-list__item-name"
                  onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(pattern.id, pattern.name); }}
                >
                  {pattern.name}
                </span>
                <span className="pattern-list__item-meta">{pattern.lengthBeats}b</span>
                <button
                  className="pattern-list__delete-btn"
                  disabled={track.patterns.length <= 1}
                  onClick={(e) => { e.stopPropagation(); handleDelete(pattern.id); }}
                  title="Delete pattern"
                >
                  ×
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
