import { useCallback, useState, useRef, useEffect } from 'react';
import { useSoundscape } from '../../state';
import type { Track, Note } from 'soundscape-engine';
import { midiToNoteName } from 'soundscape-engine';
import './NoteEditor.css';

interface NoteEditorProps {
  track: Track | null;
  patternId: string | null;
  notes: Note[];               // derived in App.tsx: pattern.trackNotes[track.id] ?? []
  lengthBeats: number;         // derived: activePattern.lengthBeats ?? state.metadata.lengthBeats
  subdivision?: number;
  onSubdivisionChange?: (subdivision: number) => void;
}

// Define piano roll range (6 octaves from C1 to C7)
const MIN_PITCH = 24; // C1
const MAX_PITCH = 96; // C7
const PITCHES = Array.from(
  { length: MAX_PITCH - MIN_PITCH + 1 },
  (_, i) => MAX_PITCH - i
);
const CELL_HEIGHT = 20;
const BEAT_MARKER_HEIGHT = 20;
const VELOCITY_LANE_HEIGHT = 60;

type Subdivision = 1 | 0.5 | 0.25;
type EditorTool = 'draw' | 'select';

interface DragState {
  pitch: number;
  startStep: number;
  currentStep: number;
}

interface RectDrag {
  startPitch: number;
  startStep: number;
  endPitch: number;
  endStep: number;
}

export function NoteEditor({ track, patternId, notes, lengthBeats, subdivision: subdivisionProp, onSubdivisionChange }: NoteEditorProps) {
  const { state, dispatch, previewNote, playback } = useSoundscape();
  const beats = lengthBeats;
  const [internalSubdivision, setInternalSubdivision] = useState<Subdivision>(
    (subdivisionProp as Subdivision) ?? 1,
  );
  const subdivision = (subdivisionProp as Subdivision) ?? internalSubdivision;
  const setSubdivision = (s: Subdivision) => {
    setInternalSubdivision(s);
    onSubdivisionChange?.(s);
  };
  const totalSteps = beats / subdivision;
  const currentStep = Math.floor(playback.currentBeat / subdivision);

  const patternName = state.patterns.find((p) => p.id === patternId)?.name ?? '';

  // Draw mode state
  const [drag, setDrag] = useState<DragState | null>(null);
  const didDrag = useRef(false);

  // Select mode state
  const [tool, setTool] = useState<EditorTool>('draw');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [rectDrag, setRectDrag] = useState<RectDrag | null>(null);
  const [clipboard, setClipboard] = useState<Note[]>([]);

  // Velocity lane state
  const [draggingVelocityNoteId, setDraggingVelocityNoteId] = useState<string | null>(null);
  const velocityLaneRef = useRef<HTMLDivElement>(null);

  // Scroll ref for auto-scroll to playhead
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to follow playhead during playback
  useEffect(() => {
    if (!playback.isPlaying || !gridContainerRef.current) return;
    const container = gridContainerRef.current;
    const cellWidth = subdivision === 0.25 ? 20 : 30;
    const labelWidth = 40;
    const playheadX = labelWidth + currentStep * cellWidth;
    const { scrollLeft, clientWidth } = container;
    const margin = cellWidth * 4;
    if (playheadX > scrollLeft + clientWidth - margin) {
      container.scrollLeft = playheadX - margin;
    }
  }, [currentStep, playback.isPlaying, subdivision]);

  // Keyboard handlers for selection operations
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!track || !patternId) return;
      const mod = e.ctrlKey || e.metaKey;

      // Select all (select mode only)
      if (mod && e.code === 'KeyA' && tool === 'select') {
        e.preventDefault();
        setSelectedNoteIds(new Set(notes.map((n) => n.id)));
        return;
      }

      // Delete selected notes
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNoteIds.size > 0) {
        e.preventDefault();
        selectedNoteIds.forEach((noteId) => {
          dispatch({ type: 'REMOVE_NOTE', payload: { patternId, trackId: track.id, noteId } });
        });
        setSelectedNoteIds(new Set());
        return;
      }

      // Copy selected notes
      if (mod && e.code === 'KeyC' && selectedNoteIds.size > 0) {
        e.preventDefault();
        setClipboard(notes.filter((n) => selectedNoteIds.has(n.id)));
        return;
      }

      // Paste notes at current playhead position
      if (mod && e.code === 'KeyV' && clipboard.length > 0) {
        e.preventDefault();
        const minStart = Math.min(...clipboard.map((n) => n.startTime));
        const pasteAt = playback.currentBeat;
        clipboard.forEach((note) => {
          dispatch({
            type: 'ADD_NOTE',
            payload: {
              patternId,
              trackId: track.id,
              pitch: note.pitch,
              startTime: note.startTime - minStart + pasteAt,
              duration: note.duration,
              velocity: note.velocity,
            },
          });
        });
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tool, track, patternId, notes, selectedNoteIds, clipboard, dispatch, playback.currentBeat]);

  // Velocity lane drag handlers
  useEffect(() => {
    if (!draggingVelocityNoteId || !track || !patternId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!velocityLaneRef.current) return;
      const rect = velocityLaneRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const velocity = Math.round(
        Math.max(1, Math.min(127, (1 - y / VELOCITY_LANE_HEIGHT) * 127))
      );
      dispatch({
        type: 'UPDATE_NOTE',
        payload: { patternId, trackId: track.id, noteId: draggingVelocityNoteId, updates: { velocity } },
      });
    };

    const handleMouseUp = () => setDraggingVelocityNoteId(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingVelocityNoteId, track, patternId, dispatch]);

  const cellWidth = subdivision === 0.25 ? 20 : 30;

  const isNoteAt = useCallback(
    (pitch: number, step: number): Note | null => {
      if (!track) return null;
      const time = step * subdivision;
      return (
        notes.find(
          (n) =>
            n.pitch === pitch &&
            time >= n.startTime &&
            time < n.startTime + n.duration
        ) || null
      );
    },
    [track, notes, subdivision]
  );

  const isNoteEnd = useCallback(
    (pitch: number, step: number): boolean => {
      if (!track) return false;
      const time = step * subdivision;
      return notes.some(
        (n) => n.pitch === pitch && time === n.startTime + n.duration - subdivision
      );
    },
    [track, notes, subdivision]
  );

  const isNoteStart = useCallback(
    (pitch: number, step: number): boolean => {
      if (!track) return false;
      const time = step * subdivision;
      return notes.some((n) => n.pitch === pitch && n.startTime === time);
    },
    [track, notes, subdivision]
  );

  const isNoteMiddle = useCallback(
    (pitch: number, step: number): boolean => {
      if (!track) return false;
      const time = step * subdivision;
      return notes.some(
        (n) =>
          n.pitch === pitch &&
          time > n.startTime &&
          time < n.startTime + n.duration - subdivision
      );
    },
    [track, notes, subdivision]
  );

  // --- Draw mode handlers ---

  const handleDrawMouseDown = useCallback(
    (pitch: number, step: number) => {
      if (!track || !patternId) return;
      const existingNote = isNoteAt(pitch, step);
      if (existingNote) {
        dispatch({
          type: 'REMOVE_NOTE',
          payload: { patternId, trackId: track.id, noteId: existingNote.id },
        });
        return;
      }
      didDrag.current = false;
      setDrag({ pitch, startStep: step, currentStep: step });
    },
    [track, patternId, dispatch, isNoteAt]
  );

  const handleDrawMouseEnter = useCallback(
    (pitch: number, step: number) => {
      if (!drag) return;
      if (pitch !== drag.pitch) return;
      if (step !== drag.currentStep) {
        didDrag.current = true;
        setDrag((prev) => (prev ? { ...prev, currentStep: step } : null));
      }
    },
    [drag]
  );

  const handleDrawMouseUp = useCallback(() => {
    if (!drag || !track || !patternId) {
      setDrag(null);
      return;
    }
    const fromStep = Math.min(drag.startStep, drag.currentStep);
    const toStep = Math.max(drag.startStep, drag.currentStep);
    const startTime = fromStep * subdivision;
    const duration = (toStep - fromStep + 1) * subdivision;
    dispatch({
      type: 'ADD_NOTE',
      payload: { patternId, trackId: track.id, pitch: drag.pitch, startTime, duration, velocity: 100 },
    });
    previewNote(drag.pitch, 100, track.presetId, track.paramOverrides);
    setDrag(null);
  }, [drag, track, patternId, dispatch, previewNote, subdivision]);

  // --- Select mode handlers ---

  const handleSelectMouseDown = useCallback(
    (pitch: number, step: number) => {
      const existingNote = isNoteAt(pitch, step);
      if (existingNote) {
        setSelectedNoteIds((prev) => {
          const next = new Set(prev);
          if (next.has(existingNote.id)) {
            next.delete(existingNote.id);
          } else {
            next.add(existingNote.id);
          }
          return next;
        });
      } else {
        setRectDrag({ startPitch: pitch, startStep: step, endPitch: pitch, endStep: step });
      }
    },
    [isNoteAt]
  );

  const handleSelectMouseEnter = useCallback((pitch: number, step: number) => {
    setRectDrag((prev) => (prev ? { ...prev, endPitch: pitch, endStep: step } : null));
  }, []);

  const handleSelectMouseUp = useCallback(() => {
    if (!rectDrag || !track) {
      setRectDrag(null);
      return;
    }
    const minPitch = Math.min(rectDrag.startPitch, rectDrag.endPitch);
    const maxPitch = Math.max(rectDrag.startPitch, rectDrag.endPitch);
    const minStep = Math.min(rectDrag.startStep, rectDrag.endStep);
    const maxStep = Math.max(rectDrag.startStep, rectDrag.endStep);

    const selected = notes.filter((note) => {
      const noteStartStep = note.startTime / subdivision;
      const noteEndStep = (note.startTime + note.duration) / subdivision;
      return (
        note.pitch >= minPitch &&
        note.pitch <= maxPitch &&
        noteStartStep <= maxStep &&
        noteEndStep > minStep
      );
    });
    setSelectedNoteIds(new Set(selected.map((n) => n.id)));
    setRectDrag(null);
  }, [rectDrag, track, notes, subdivision]);

  // --- Unified event handlers ---

  const handleMouseDown = useCallback(
    (pitch: number, step: number) => {
      if (tool === 'draw') handleDrawMouseDown(pitch, step);
      else handleSelectMouseDown(pitch, step);
    },
    [tool, handleDrawMouseDown, handleSelectMouseDown]
  );

  const handleMouseEnter = useCallback(
    (pitch: number, step: number) => {
      if (tool === 'draw') handleDrawMouseEnter(pitch, step);
      else handleSelectMouseEnter(pitch, step);
    },
    [tool, handleDrawMouseEnter, handleSelectMouseEnter]
  );

  const handleMouseUp = useCallback(() => {
    if (tool === 'draw') handleDrawMouseUp();
    else handleSelectMouseUp();
  }, [tool, handleDrawMouseUp, handleSelectMouseUp]);

  const getDragRange = (pitch: number, step: number): boolean => {
    if (!drag || pitch !== drag.pitch) return false;
    const fromStep = Math.min(drag.startStep, drag.currentStep);
    const toStep = Math.max(drag.startStep, drag.currentStep);
    return step >= fromStep && step <= toStep;
  };

  // Compute selection rect pixel position for overlay
  const getSelectionRectStyle = (): React.CSSProperties | null => {
    if (!rectDrag) return null;
    const minPitch = Math.min(rectDrag.startPitch, rectDrag.endPitch);
    const maxPitch = Math.max(rectDrag.startPitch, rectDrag.endPitch);
    const minStep = Math.min(rectDrag.startStep, rectDrag.endStep);
    const maxStep = Math.max(rectDrag.startStep, rectDrag.endStep);
    const topRow = MAX_PITCH - maxPitch;
    const rowCount = maxPitch - minPitch + 1;
    return {
      top: BEAT_MARKER_HEIGHT + topRow * CELL_HEIGHT,
      left: minStep * cellWidth,
      width: (maxStep - minStep + 1) * cellWidth,
      height: rowCount * CELL_HEIGHT,
    };
  };

  const handleRandomizeNotes = () => {
    if (!track || !patternId) return;
    dispatch({ type: 'CLEAR_PATTERN_TRACK_NOTES', payload: { patternId, trackId: track.id } });
    const noteCount = Math.floor(Math.random() * 12) + 4;
    const occupied = new Set<string>();
    for (let i = 0; i < noteCount; i++) {
      const pitch = Math.floor(Math.random() * (MAX_PITCH - MIN_PITCH + 1)) + MIN_PITCH;
      const startStep = Math.floor(Math.random() * totalSteps);
      const startTime = startStep * subdivision;
      const key = `${pitch}:${startTime}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      const maxSteps = Math.min(totalSteps - startStep, Math.round(3 / subdivision));
      const durationSteps = Math.floor(Math.random() * maxSteps) + 1;
      const duration = durationSteps * subdivision;
      const velocity = Math.floor(Math.random() * 68) + 60;
      dispatch({
        type: 'ADD_NOTE',
        payload: { patternId, trackId: track.id, pitch, startTime, duration, velocity },
      });
    }
  };

  const selectionRectStyle = getSelectionRectStyle();

  if (!track || !patternId) {
    return (
      <div className="note-editor note-editor-empty">
        <p>Select a track and pattern to edit notes</p>
      </div>
    );
  }

  return (
    <div
      className="note-editor"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (drag || rectDrag) handleMouseUp(); }}
    >
      <div className="note-editor-header">
        <h3>Note Editor — {track.name} / {patternName}</h3>
        <div className="note-editor-controls">
          {/* Tool toggle */}
          <div className="tool-toggle">
            <button
              className={`tool-toggle-btn ${tool === 'draw' ? 'active' : ''}`}
              onClick={() => setTool('draw')}
              title="Draw mode — click to add/remove notes"
            >
              Draw
            </button>
            <button
              className={`tool-toggle-btn ${tool === 'select' ? 'active' : ''}`}
              onClick={() => setTool('select')}
              title="Select mode — drag to select, Delete to remove"
            >
              Select
            </button>
          </div>
          {/* Resolution toggle */}
          <div className="resolution-toggle">
            {([1, 0.5, 0.25] as Subdivision[]).map((sub) => (
              <button
                key={sub}
                className={`resolution-btn ${subdivision === sub ? 'active' : ''}`}
                onClick={() => setSubdivision(sub)}
              >
                {sub === 1 ? '1/4' : sub === 0.5 ? '1/8' : '1/16'}
              </button>
            ))}
          </div>
          <button className="randomize-notes-btn" onClick={handleRandomizeNotes}>
            Randomize
          </button>
        </div>
      </div>

      <div className="note-editor-grid-container" ref={gridContainerRef}>
        {/* Pitch labels */}
        <div className="note-editor-labels">
          <div className="note-editor-label-spacer" />
          {PITCHES.map((pitch) => {
            const noteName = midiToNoteName(pitch);
            const isBlackKey = noteName.includes('#');
            return (
              <div
                key={pitch}
                className={`note-editor-label ${isBlackKey ? 'black-key' : ''}`}
              >
                {noteName}
              </div>
            );
          })}
          <div className="velocity-lane-label" style={{ height: VELOCITY_LANE_HEIGHT }}>
            vel
          </div>
        </div>

        {/* Grid */}
        <div className="note-editor-grid">
          {/* Beat markers */}
          <div className="note-editor-beat-markers">
            {Array.from({ length: totalSteps }, (_, stepIndex) => {
              const time = stepIndex * subdivision;
              const isQuarterBeat = time % 1 === 0;
              return (
                <div
                  key={stepIndex}
                  className={`note-editor-beat-marker${subdivision !== 1 ? ' sub' : ''} ${playback.isPlaying && currentStep === stepIndex ? 'playing' : ''}`}
                >
                  {isQuarterBeat ? time + 1 : ''}
                </div>
              );
            })}
          </div>

          {/* Note rows */}
          {PITCHES.map((pitch) => {
            const noteName = midiToNoteName(pitch);
            const isBlackKey = noteName.includes('#');
            return (
              <div
                key={pitch}
                className={`note-editor-row ${isBlackKey ? 'black-key-row' : ''}`}
              >
                {Array.from({ length: totalSteps }, (_, stepIndex) => {
                  const time = stepIndex * subdivision;
                  const note = isNoteAt(pitch, stepIndex);
                  const start = isNoteStart(pitch, stepIndex);
                  const end = isNoteEnd(pitch, stepIndex);
                  const middle = isNoteMiddle(pitch, stepIndex);
                  const isCurrentStep = playback.isPlaying && currentStep === stepIndex;
                  const isDragPreview = getDragRange(pitch, stepIndex);
                  const isBarStart = time % 4 === 0;
                  const isBeatStart = !isBarStart && time % 1 === 0;
                  const isSelected = note ? selectedNoteIds.has(note.id) : false;
                  return (
                    <div
                      key={stepIndex}
                      className={[
                        'note-editor-cell',
                        note ? 'has-note' : '',
                        start ? 'note-start' : '',
                        end ? 'note-end' : '',
                        middle ? 'note-middle' : '',
                        isBarStart ? 'bar-start' : '',
                        isBeatStart ? 'beat-start' : '',
                        isCurrentStep ? 'playing' : '',
                        isDragPreview ? 'drag-preview' : '',
                        subdivision === 0.25 ? 'cell-sm' : '',
                        isSelected ? 'selected' : '',
                      ].filter(Boolean).join(' ')}
                      style={note ? ({ '--vel': String(note.velocity / 127) } as React.CSSProperties) : undefined}
                      onMouseDown={(e) => { e.preventDefault(); handleMouseDown(pitch, stepIndex); }}
                      onMouseEnter={() => handleMouseEnter(pitch, stepIndex)}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Selection rect overlay */}
          {selectionRectStyle && (
            <div className="selection-rect" style={selectionRectStyle} />
          )}

          {/* Velocity lane */}
          <div
            className="velocity-lane"
            ref={velocityLaneRef}
            style={{ height: VELOCITY_LANE_HEIGHT }}
          >
            {notes.map((note) => {
              const stepIndex = Math.round(note.startTime / subdivision);
              const barHeight = (note.velocity / 127) * VELOCITY_LANE_HEIGHT;
              return (
                <div
                  key={note.id}
                  className={`velocity-bar${draggingVelocityNoteId === note.id ? ' dragging' : ''}`}
                  style={{
                    left: stepIndex * cellWidth,
                    width: Math.max(cellWidth - 2, 2),
                    height: barHeight,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggingVelocityNoteId(note.id);
                  }}
                  title={`Velocity: ${note.velocity}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
