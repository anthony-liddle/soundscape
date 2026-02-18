import { useCallback, useState, useRef } from 'react';
import { useSoundscape } from '../../state';
import type { Track, Note } from 'soundscape-engine';
import { midiToNoteName } from 'soundscape-engine';
import './NoteEditor.css';

interface NoteEditorProps {
  track: Track | null;
}

// Define piano roll range (6 octaves from C1 to C7)
const MIN_PITCH = 24; // C1
const MAX_PITCH = 96; // C7
const PITCHES = Array.from(
  { length: MAX_PITCH - MIN_PITCH + 1 },
  (_, i) => MAX_PITCH - i
);

type Subdivision = 1 | 0.5 | 0.25;

interface DragState {
  pitch: number;
  startStep: number;
  currentStep: number;
}

export function NoteEditor({ track }: NoteEditorProps) {
  const { state, dispatch, previewNote, playback } = useSoundscape();
  const beats = state.metadata.lengthBeats;
  const [subdivision, setSubdivision] = useState<Subdivision>(1);
  const totalSteps = beats / subdivision;
  const currentStep = Math.floor(playback.currentBeat / subdivision);
  const [drag, setDrag] = useState<DragState | null>(null);
  const didDrag = useRef(false);

  const isNoteAt = useCallback(
    (pitch: number, step: number): Note | null => {
      if (!track) return null;
      const time = step * subdivision;
      return (
        track.notes.find(
          (n) =>
            n.pitch === pitch &&
            time >= n.startTime &&
            time < n.startTime + n.duration
        ) || null
      );
    },
    [track, subdivision]
  );

  const isNoteEnd = useCallback(
    (pitch: number, step: number): boolean => {
      if (!track) return false;
      const time = step * subdivision;
      return track.notes.some(
        (n) => n.pitch === pitch && time === n.startTime + n.duration - subdivision
      );
    },
    [track, subdivision]
  );

  const isNoteStart = useCallback(
    (pitch: number, step: number): boolean => {
      if (!track) return false;
      const time = step * subdivision;
      return track.notes.some((n) => n.pitch === pitch && n.startTime === time);
    },
    [track, subdivision]
  );

  const isNoteMiddle = useCallback(
    (pitch: number, step: number): boolean => {
      if (!track) return false;
      const time = step * subdivision;
      return track.notes.some(
        (n) =>
          n.pitch === pitch &&
          time > n.startTime &&
          time < n.startTime + n.duration - subdivision
      );
    },
    [track, subdivision]
  );

  const handleMouseDown = useCallback(
    (pitch: number, step: number) => {
      if (!track) return;

      const existingNote = isNoteAt(pitch, step);
      if (existingNote) {
        // Remove note immediately on mousedown on existing note
        dispatch({
          type: 'REMOVE_NOTE',
          payload: { trackId: track.id, noteId: existingNote.id },
        });
        return;
      }

      // Start drag for new note
      didDrag.current = false;
      setDrag({ pitch, startStep: step, currentStep: step });
    },
    [track, dispatch, isNoteAt]
  );

  const handleMouseEnter = useCallback(
    (pitch: number, step: number) => {
      if (!drag) return;
      // Only allow horizontal dragging on same pitch
      if (pitch !== drag.pitch) return;
      if (step !== drag.currentStep) {
        didDrag.current = true;
        setDrag((prev) => (prev ? { ...prev, currentStep: step } : null));
      }
    },
    [drag]
  );

  const handleMouseUp = useCallback(() => {
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

  const getDragRange = (pitch: number, step: number): boolean => {
    if (!drag || pitch !== drag.pitch) return false;
    const fromStep = Math.min(drag.startStep, drag.currentStep);
    const toStep = Math.max(drag.startStep, drag.currentStep);
    return step >= fromStep && step <= toStep;
  };

  const handleRandomizeNotes = () => {
    if (!track) return;

    dispatch({ type: 'CLEAR_TRACK_NOTES', payload: { trackId: track.id } });

    const noteCount = Math.floor(Math.random() * 12) + 4; // 4-15 notes
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
      const velocity = Math.floor(Math.random() * 68) + 60; // 60-127

      dispatch({
        type: 'ADD_NOTE',
        payload: { trackId: track.id, pitch, startTime, duration, velocity },
      });
    }
  };

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
      onMouseLeave={() => { if (drag) handleMouseUp(); }}
    >
      <div className="note-editor-header">
        <h3>Note Editor - {track.name}</h3>
        <div className="note-editor-controls">
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

      <div className="note-editor-grid-container">
        {/* Pitch labels */}
        <div className="note-editor-labels">
          {/* Spacer to align with beat markers */}
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
                  const note = isNoteAt(pitch, stepIndex);
                  const start = isNoteStart(pitch, stepIndex);
                  const end = isNoteEnd(pitch, stepIndex);
                  const middle = isNoteMiddle(pitch, stepIndex);
                  const isCurrentStep = playback.isPlaying && currentStep === stepIndex;
                  const isDragPreview = getDragRange(pitch, stepIndex);
                  const isBarStart = time % 4 === 0;
                  const isBeatStart = !isBarStart && time % 1 === 0;
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
                      ].filter(Boolean).join(' ')}
                      onMouseDown={(e) => { e.preventDefault(); handleMouseDown(pitch, stepIndex); }}
                      onMouseEnter={() => handleMouseEnter(pitch, stepIndex)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
