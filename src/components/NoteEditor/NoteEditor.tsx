import { useCallback } from 'react';
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

export function NoteEditor({ track }: NoteEditorProps) {
  const { state, dispatch, previewNote, playback } = useSoundscape();
  const beats = state.metadata.lengthBeats;
  const currentBeat = Math.floor(playback.currentBeat);

  const handleCellClick = useCallback(
    (pitch: number, startTime: number) => {
      if (!track) return;

      // Check if there's a note at this position
      const existingNote = track.notes.find(
        (n) => n.pitch === pitch && n.startTime === startTime
      );

      if (existingNote) {
        // Remove note
        dispatch({
          type: 'REMOVE_NOTE',
          payload: { trackId: track.id, noteId: existingNote.id },
        });
      } else {
        // Add note
        dispatch({
          type: 'ADD_NOTE',
          payload: { trackId: track.id, pitch, startTime, duration: 1, velocity: 100 },
        });
        // Preview the note
        previewNote(pitch, 100, track.presetId, track.paramOverrides);
      }
    },
    [track, dispatch, previewNote]
  );

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

  const isNoteStart = useCallback(
    (pitch: number, beat: number): boolean => {
      if (!track) return false;
      return track.notes.some((n) => n.pitch === pitch && n.startTime === beat);
    },
    [track]
  );

  if (!track) {
    return (
      <div className="note-editor note-editor-empty">
        <p>Select a track to edit notes</p>
      </div>
    );
  }

  return (
    <div className="note-editor">
      <div className="note-editor-header">
        <h3>Note Editor - {track.name}</h3>
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
                  const isStart = isNoteStart(pitch, beat);
                  const isCurrentBeat = playback.isPlaying && currentBeat === beat;
                  return (
                    <div
                      key={beat}
                      className={`note-editor-cell ${note ? 'has-note' : ''} ${
                        isStart ? 'note-start' : ''
                      } ${beat % 4 === 0 ? 'bar-start' : ''} ${isCurrentBeat ? 'playing' : ''}`}
                      onClick={() => handleCellClick(pitch, beat)}
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
