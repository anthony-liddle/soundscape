import { useCallback, useEffect, useRef, useState } from 'react';
import { useSoundscape } from '../../state';
import './ArrangementView.css';

const CELL_WIDTH = 30; // px per beat
const ROW_HEIGHT = 44; // px for the single timeline row

interface DraggingClip { clipId: string; grabOffsetBeats: number }

interface ArrangementViewProps {
  activePatternId: string | null;
}

export function ArrangementView({ activePatternId }: ArrangementViewProps) {
  const { state, dispatch, playback } = useSoundscape();
  const [dragging, setDragging] = useState<DraggingClip | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const totalBeats = state.metadata.lengthBeats;

  // Drag-to-move clips
  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const rawBeat = (e.clientX - rect.left) / CELL_WIDTH - dragging.grabOffsetBeats;
      dispatch({
        type: 'MOVE_CLIP',
        payload: { clipId: dragging.clipId, startBeat: Math.max(0, Math.round(rawBeat)) },
      });
    };
    const handleMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, dispatch]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      if (!activePatternId || dragging) return;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const beat = Math.max(0, Math.floor((e.clientX - rect.left) / CELL_WIDTH));
      dispatch({ type: 'ADD_CLIP', payload: { patternId: activePatternId, startBeat: beat } });
    },
    [activePatternId, dragging, dispatch]
  );

  return (
    <div className="arrangement-view">
      <div className="arrangement-label">Arrangement</div>

      <div className="arrangement-scroll">
        {/* Ruler */}
        <div className="arrangement-ruler" style={{ width: totalBeats * CELL_WIDTH }}>
          {Array.from({ length: totalBeats }, (_, i) => (
            <div
              key={i}
              className={`arrangement-beat${i % 4 === 0 ? ' bar-start' : ''}`}
              style={{ width: CELL_WIDTH }}
            >
              {i % 4 === 0 ? i + 1 : ''}
            </div>
          ))}
        </div>

        {/* Single timeline row */}
        <div
          ref={rowRef}
          className="arrangement-row"
          style={{ width: totalBeats * CELL_WIDTH, height: ROW_HEIGHT }}
          onClick={handleRowClick}
        >
          {!activePatternId && (
            <span className="arrangement-row__empty-hint">Add a pattern to get started</span>
          )}
          {activePatternId && state.arrangement.length === 0 && (
            <span className="arrangement-row__empty-hint">Click here to place the active pattern</span>
          )}

          {state.arrangement.map((clip) => {
            const pattern = state.patterns.find((p) => p.id === clip.patternId);
            if (!pattern) return null;
            const isActive = clip.patternId === activePatternId;
            return (
              <div
                key={clip.id}
                className={`arrangement-clip${isActive ? ' arrangement-clip--active' : ''}`}
                style={{ left: clip.startBeat * CELL_WIDTH, width: pattern.lengthBeats * CELL_WIDTH - 2 }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDragging({ clipId: clip.id, grabOffsetBeats: (e.clientX - rect.left) / CELL_WIDTH });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  dispatch({ type: 'REMOVE_CLIP', payload: { clipId: clip.id } });
                }}
                title={`${pattern.name} — right-click to remove`}
              >
                <span className="arrangement-clip__label">{pattern.name}</span>
              </div>
            );
          })}

          {/* Playhead */}
          {playback.isPlaying && (
            <div
              className="arrangement-playhead"
              style={{ left: playback.currentBeat * CELL_WIDTH }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
