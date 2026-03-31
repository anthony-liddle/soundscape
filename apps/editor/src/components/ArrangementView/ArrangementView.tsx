// apps/editor/src/components/ArrangementView/ArrangementView.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSoundscape } from '../../state';
import './ArrangementView.css';

const CELL_WIDTH = 30; // pixels per beat
const ROW_HEIGHT = 36; // pixels per track row
const LABEL_WIDTH = 100; // pixels for track name column

interface DraggingClip {
  trackId: string;
  clipId: string;
  /** Beat offset from the clip's startBeat to where the user grabbed it */
  grabOffsetBeats: number;
}

interface ArrangementViewProps {
  /** The pattern id that will be placed when clicking empty space */
  activePatternId: string | null;
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
}

export function ArrangementView({
  activePatternId,
  selectedTrackId,
  onSelectTrack,
}: ArrangementViewProps) {
  const { state, dispatch, playback } = useSoundscape();
  const [dragging, setDragging] = useState<DraggingClip | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const totalBeats = state.metadata.lengthBeats;

  // Drag-to-move clips
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const rawBeat = (e.clientX - rect.left) / CELL_WIDTH - dragging.grabOffsetBeats;
      const beat = Math.max(0, Math.round(rawBeat));
      dispatch({
        type: 'MOVE_CLIP',
        payload: { trackId: dragging.trackId, clipId: dragging.clipId, startBeat: beat },
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
    (e: React.MouseEvent, trackId: string) => {
      if (!activePatternId || dragging) return;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const beat = Math.floor((e.clientX - rect.left) / CELL_WIDTH);
      dispatch({
        type: 'ADD_CLIP',
        payload: { trackId, patternId: activePatternId, startBeat: beat },
      });
    },
    [activePatternId, dragging, dispatch]
  );

  return (
    <div className="arrangement-view">
      {/* Track label column */}
      <div className="arrangement-labels" style={{ width: LABEL_WIDTH }}>
        <div className="arrangement-ruler-label" />
        {state.tracks.map((track) => (
          <div
            key={track.id}
            className={`arrangement-track-label${track.id === selectedTrackId ? ' selected' : ''}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onSelectTrack(track.id)}
          >
            {track.name}
          </div>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div className="arrangement-scroll">
        {/* Beat ruler */}
        <div
          className="arrangement-ruler"
          style={{ width: totalBeats * CELL_WIDTH }}
          ref={timelineRef}
        >
          {Array.from({ length: totalBeats }, (_, i) => (
            <div key={i} className={`arrangement-beat${i % 4 === 0 ? ' bar-start' : ''}`} style={{ width: CELL_WIDTH }}>
              {i % 4 === 0 ? i + 1 : ''}
            </div>
          ))}
        </div>

        {/* Track rows */}
        <div className="arrangement-rows" style={{ width: totalBeats * CELL_WIDTH }}>
          {state.tracks.map((track) => (
            <div
              key={track.id}
              className={`arrangement-row${track.id === selectedTrackId ? ' selected' : ''}`}
              style={{ height: ROW_HEIGHT, width: totalBeats * CELL_WIDTH }}
              onClick={(e) => { onSelectTrack(track.id); handleRowClick(e, track.id); }}
            >
              {track.arrangement.map((clip) => {
                const pattern = track.patterns.find((p) => p.id === clip.patternId);
                if (!pattern) return null;
                return (
                  <div
                    key={clip.id}
                    className={`arrangement-clip${clip.patternId === activePatternId ? ' arrangement-clip--active-pattern' : ''}`}
                    style={{
                      left: clip.startBeat * CELL_WIDTH,
                      width: pattern.lengthBeats * CELL_WIDTH - 2,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const grabOffsetBeats = (e.clientX - rect.left) / CELL_WIDTH;
                      setDragging({ trackId: track.id, clipId: clip.id, grabOffsetBeats });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      dispatch({
                        type: 'REMOVE_CLIP',
                        payload: { trackId: track.id, clipId: clip.id },
                      });
                    }}
                    title={`${pattern.name} — right-click to remove`}
                  >
                    <span className="arrangement-clip__label">{pattern.name}</span>
                  </div>
                );
              })}
            </div>
          ))}

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
