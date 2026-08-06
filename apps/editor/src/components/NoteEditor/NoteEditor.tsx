import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useSoundscape } from '../../state';
import type { Track, Note } from 'soundscape-engine';
import { midiToNoteName } from 'soundscape-engine';
import './NoteEditor.css';

export type Subdivision = 1 | 0.5 | 0.25;

interface NoteEditorProps {
  track: Track | null;
  /** Grid resolution, owned by the parent so MIDI recording can widen it. */
  subdivision: Subdivision;
  onSubdivisionChange: (subdivision: Subdivision) => void;
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

export function NoteEditor({
  track,
  subdivision,
  onSubdivisionChange,
}: NoteEditorProps) {
  const { state, dispatch, previewNote, playback } = useSoundscape();
  const beats = state.metadata.lengthBeats;
  const totalSteps = beats / subdivision;
  const currentStep = Math.floor(playback.currentBeat / subdivision);

  // Draw mode state
  const [drag, setDrag] = useState<DragState | null>(null);
  const didDrag = useRef(false);

  // Select mode state
  const [tool, setTool] = useState<EditorTool>('draw');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [rectDrag, setRectDrag] = useState<RectDrag | null>(null);
  const [clipboard, setClipboard] = useState<Note[]>([]);

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
      if (!track) return;
      const mod = e.ctrlKey || e.metaKey;

      // Select all (select mode only)
      if (mod && e.code === 'KeyA' && tool === 'select') {
        e.preventDefault();
        setSelectedNoteIds(new Set(track.notes.map((n) => n.id)));
        return;
      }

      // Delete selected notes (single action = single undo step)
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNoteIds.size > 0) {
        e.preventDefault();
        dispatch({
          type: 'REMOVE_NOTES',
          payload: { trackId: track.id, noteIds: [...selectedNoteIds] },
        });
        setSelectedNoteIds(new Set());
        return;
      }

      // Copy selected notes
      if (mod && e.code === 'KeyC' && selectedNoteIds.size > 0) {
        e.preventDefault();
        setClipboard(track.notes.filter((n) => selectedNoteIds.has(n.id)));
        return;
      }

      // Paste notes at the playhead, quantized to the current grid so the
      // result stays editable (off-grid notes don't render as start/end cells)
      if (mod && e.code === 'KeyV' && clipboard.length > 0) {
        e.preventDefault();
        const minStart = Math.min(...clipboard.map((n) => n.startTime));
        const pasteAt = Math.round(playback.currentBeat / subdivision) * subdivision;
        dispatch({
          type: 'ADD_NOTES',
          payload: {
            trackId: track.id,
            notes: clipboard.map((note) => ({
              pitch: note.pitch,
              startTime: note.startTime - minStart + pasteAt,
              duration: note.duration,
              velocity: note.velocity,
            })),
          },
        });
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tool, track, selectedNoteIds, clipboard, dispatch, playback.currentBeat, subdivision]);

  const cellWidth = subdivision === 0.25 ? 20 : 30;

  // Index notes by pitch so each cell lookup scans only that row's notes
  // instead of the whole track (the grid renders thousands of cells).
  const notesByPitch = useMemo(() => {
    const map = new Map<number, Note[]>();
    if (!track) return map;
    for (const note of track.notes) {
      const row = map.get(note.pitch);
      if (row) {
        row.push(note);
      } else {
        map.set(note.pitch, [note]);
      }
    }
    return map;
  }, [track]);

  interface CellInfo {
    note: Note;
    isStart: boolean;
    isEnd: boolean;
    isMiddle: boolean;
  }

  const getCellInfo = useCallback(
    (pitch: number, step: number): CellInfo | null => {
      const time = step * subdivision;
      const row = notesByPitch.get(pitch);
      if (!row) return null;
      for (const n of row) {
        if (time >= n.startTime && time < n.startTime + n.duration) {
          return {
            note: n,
            isStart: n.startTime === time,
            isEnd: time === n.startTime + n.duration - subdivision,
            isMiddle: time > n.startTime && time < n.startTime + n.duration - subdivision,
          };
        }
      }
      return null;
    },
    [notesByPitch, subdivision]
  );

  const isNoteAt = useCallback(
    (pitch: number, step: number): Note | null => getCellInfo(pitch, step)?.note ?? null,
    [getCellInfo]
  );

  // --- Draw mode handlers ---

  const handleDrawMouseDown = useCallback(
    (pitch: number, step: number) => {
      if (!track) return;
      const existingNote = isNoteAt(pitch, step);
      if (existingNote) {
        dispatch({
          type: 'REMOVE_NOTE',
          payload: { trackId: track.id, noteId: existingNote.id },
        });
        return;
      }
      didDrag.current = false;
      setDrag({ pitch, startStep: step, currentStep: step });
    },
    [track, dispatch, isNoteAt]
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
    if (!drag || !track) {
      setDrag(null);
      return;
    }
    const fromStep = Math.min(drag.startStep, drag.currentStep);
    const toStep = Math.max(drag.startStep, drag.currentStep);
    const startTime = fromStep * subdivision;
    const duration = (toStep - fromStep + 1) * subdivision;
    dispatch({
      type: 'ADD_NOTE',
      payload: { trackId: track.id, pitch: drag.pitch, startTime, duration, velocity: 100 },
    });
    previewNote(drag.pitch, 100, track.presetId, track.paramOverrides);
    setDrag(null);
  }, [drag, track, dispatch, previewNote, subdivision]);

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

    const selected = track.notes.filter((note) => {
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
  }, [rectDrag, track, subdivision]);

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
    if (!track) return;
    const noteCount = Math.floor(Math.random() * 12) + 4;
    const occupied = new Set<string>();
    const notes = [];
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
      notes.push({ pitch, startTime, duration, velocity });
    }
    // Single action: replaces existing notes and is one undo step
    dispatch({ type: 'SET_TRACK_NOTES', payload: { trackId: track.id, notes } });
  };

  const selectionRectStyle = getSelectionRectStyle();

  if (!track) {
    return (
      <div className="note-editor note-editor-empty">
        <p>Select a track to edit notes</p>
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
        <h3>Note Editor - {track.name}</h3>
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
                onClick={() => onSubdivisionChange(sub)}
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
                  const cell = getCellInfo(pitch, stepIndex);
                  const note = cell?.note ?? null;
                  const start = cell?.isStart ?? false;
                  const end = cell?.isEnd ?? false;
                  const middle = cell?.isMiddle ?? false;
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
        </div>
      </div>
    </div>
  );
}
