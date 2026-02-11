import { useCallback, useState, useRef } from 'react';
import { useSoundscape } from '../../state';
import type { Track, Note } from '../../types';
import { midiToNoteName } from '../../utils/pitch';
import './NoteEditor.css';

interface NoteEditorProps {
  track: Track | null;
}

// Define piano roll range (2 octaves from C3 to B4)
const MIN_PITCH = 48; // C3
const MAX_PITCH = 72; // C5
const PITCHES = Array.from(
  { length: MAX_PITCH - MIN_PITCH + 1 },
  (_, i) => MAX_PITCH - i
);

interface DragState {
  pitch: number;
  startBeat: number;
  currentBeat: number;
}

export function NoteEditor({ track }: NoteEditorProps) {
  const { state, dispatch, previewNote, playback } = useSoundscape();
  const beats = state.metadata.lengthBeats;
  const currentBeat = Math.floor(playback.currentBeat);
  const [drag, setDrag] = useState<DragState | null>(null);
  const didDrag = useRef(false);

  const isNoteAt = useCallback(
    (pitch: number, beat: number): Note | null => {
      if (!track) return null;
      return (
        track.notes.find(
          (n) =>
            n.pitch === pitch &&
            beat >= n.startTime &&
            beat < n.startTime + n.duration
        ) || null
      );
    },
    [track]
  );

  const isNoteEnd = useCallback(
    (pitch: number, beat: number): boolean => {
      if (!track) return false;
      return track.notes.some(
        (n) => n.pitch === pitch && beat === n.startTime + n.duration - 1
      );
    },
    [track]
  );

  const isNoteStart = useCallback(
    (pitch: number, beat: number): boolean => {
      if (!track) return false;
      return track.notes.some((n) => n.pitch === pitch && n.startTime === beat);
    },
    [track]
  );

  const isNoteMiddle = useCallback(
    (pitch: number, beat: number): boolean => {
      if (!track) return false;
      return track.notes.some(
        (n) =>
          n.pitch === pitch &&
          beat > n.startTime &&
          beat < n.startTime + n.duration - 1
      );
    },
    [track]
  );

  const handleMouseDown = useCallback(
    (pitch: number, beat: number) => {
      if (!track) return;

      const existingNote = isNoteAt(pitch, beat);
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
      setDrag({ pitch, startBeat: beat, currentBeat: beat });
    },
    [track, dispatch, isNoteAt]
  );

  const handleMouseEnter = useCallback(
    (pitch: number, beat: number) => {
      if (!drag) return;
      // Only allow horizontal dragging on same pitch
      if (pitch !== drag.pitch) return;
      if (beat !== drag.currentBeat) {
        didDrag.current = true;
        setDrag((prev) => (prev ? { ...prev, currentBeat: beat } : null));
      }
    },
    [drag]
  );

  const handleMouseUp = useCallback(() => {
    if (!drag || !track) {
      setDrag(null);
      return;
    }

    const fromBeat = Math.min(drag.startBeat, drag.currentBeat);
    const toBeat = Math.max(drag.startBeat, drag.currentBeat);
    const duration = toBeat - fromBeat + 1;

    dispatch({
      type: 'ADD_NOTE',
      payload: { trackId: track.id, pitch: drag.pitch, startTime: fromBeat, duration, velocity: 100 },
    });
    previewNote(drag.pitch, 100, track.presetId, track.paramOverrides);

    setDrag(null);
  }, [drag, track, dispatch, previewNote]);

  const getDragRange = (pitch: number, beat: number): boolean => {
    if (!drag || pitch !== drag.pitch) return false;
    const fromBeat = Math.min(drag.startBeat, drag.currentBeat);
    const toBeat = Math.max(drag.startBeat, drag.currentBeat);
    return beat >= fromBeat && beat <= toBeat;
  };

  const handleRandomizeNotes = () => {
    if (!track) return;

    dispatch({ type: 'CLEAR_TRACK_NOTES', payload: { trackId: track.id } });

    const noteCount = Math.floor(Math.random() * 12) + 4; // 4-15 notes
    const occupied = new Set<string>();

    for (let i = 0; i < noteCount; i++) {
      const pitch = Math.floor(Math.random() * (MAX_PITCH - MIN_PITCH + 1)) + MIN_PITCH;
      const startTime = Math.floor(Math.random() * beats);
      const key = `${pitch}:${startTime}`;
      if (occupied.has(key)) continue;
      occupied.add(key);

      const maxDuration = Math.min(beats - startTime, 3);
      const duration = Math.floor(Math.random() * maxDuration) + 1;
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
        <button className="randomize-notes-btn" onClick={handleRandomizeNotes}>
          Randomize
        </button>
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
            {Array.from({ length: beats }, (_, i) => (
              <div
                key={i}
                className={`note-editor-beat-marker ${playback.isPlaying && currentBeat === i ? 'playing' : ''}`}
              >
                {i + 1}
              </div>
            ))}
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
                {Array.from({ length: beats }, (_, beat) => {
                  const note = isNoteAt(pitch, beat);
                  const start = isNoteStart(pitch, beat);
                  const end = isNoteEnd(pitch, beat);
                  const middle = isNoteMiddle(pitch, beat);
                  const isCurrentBeat = playback.isPlaying && currentBeat === beat;
                  const isDragPreview = getDragRange(pitch, beat);
                  return (
                    <div
                      key={beat}
                      className={[
                        'note-editor-cell',
                        note ? 'has-note' : '',
                        start ? 'note-start' : '',
                        end ? 'note-end' : '',
                        middle ? 'note-middle' : '',
                        beat % 4 === 0 ? 'bar-start' : '',
                        isCurrentBeat ? 'playing' : '',
                        isDragPreview ? 'drag-preview' : '',
                      ].filter(Boolean).join(' ')}
                      onMouseDown={(e) => { e.preventDefault(); handleMouseDown(pitch, beat); }}
                      onMouseEnter={() => handleMouseEnter(pitch, beat)}
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
