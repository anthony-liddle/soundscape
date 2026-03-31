import { useCallback, useEffect, useRef, useState } from 'react';
import { useSoundscape } from '../../state';
import { useMIDIInput } from '../../hooks/useMIDIInput';
import type { Track } from 'soundscape-engine';
import './MIDIStatus.css';

interface ActiveNote {
  startBeat: number;
  velocity: number;
  trackId: string;
}

interface MIDIStatusProps {
  selectedTrack: Track | null;
  subdivision: number;
}

export function MIDIStatus({ selectedTrack, subdivision }: MIDIStatusProps) {
  const { state, startNote, stopNote, dispatch, playback } = useSoundscape();
  const [isRecording, setIsRecording] = useState(false);
  const activeNotesRef = useRef<Map<number, ActiveNote>>(new Map());
  const activePatternId = state.patterns[0]?.id ?? null;

  // Ref to latest values to avoid stale closures in MIDI callbacks
  const recordingRef = useRef({ isRecording, subdivision, playback, selectedTrack, activePatternId });
  useEffect(() => {
    recordingRef.current = { isRecording, subdivision, playback, selectedTrack, activePatternId };
  });

  const onNoteOn = useCallback(
    (pitch: number, velocity: number) => {
      const { selectedTrack: track } = recordingRef.current;
      if (!track) return;
      startNote(pitch, velocity, track.presetId, track.paramOverrides);
      const { isRecording: rec, playback: pb } = recordingRef.current;
      if (rec && pb.isPlaying) {
        activeNotesRef.current.set(pitch, { startBeat: pb.currentBeat, velocity, trackId: track.id });
      }
    },
    [startNote],
  );

  const onNoteOff = useCallback(
    (pitch: number) => {
      stopNote(pitch);
      const { isRecording: rec, playback: pb, subdivision: sub, activePatternId: patId } =
        recordingRef.current;
      if (!rec || !pb.isPlaying || !patId) return;

      const noteData = activeNotesRef.current.get(pitch);
      if (!noteData) return;

      const duration = Math.max(pb.currentBeat - noteData.startBeat, sub);
      dispatch({
        type: 'ADD_NOTE',
        payload: {
          patternId: patId,
          trackId: noteData.trackId,
          pitch,
          startTime: noteData.startBeat,
          duration,
          velocity: noteData.velocity,
        },
      });
      activeNotesRef.current.delete(pitch);
    },
    [stopNote, dispatch],
  );

  const { isSupported, isConnected, error, deviceNames, connect } = useMIDIInput({
    onNoteOn,
    onNoteOff,
  });

  if (!isSupported) {
    return <div className="midi-status midi-status--unsupported">MIDI unavailable</div>;
  }

  return (
    <div className="midi-status">
      {isConnected ? (
        <>
          <span
            className="midi-status__connected"
            title={deviceNames.join(', ') || 'Connected'}
          >
            MIDI ●{' '}
            {deviceNames.length > 0 ? deviceNames[0] : 'connected'}
            {deviceNames.length > 1 ? ` +${deviceNames.length - 1}` : ''}
          </span>
          <button
            className={`midi-status__record-btn${isRecording ? ' midi-status__record-btn--active' : ''}`}
            onClick={() => {
              setIsRecording((r) => {
                if (r) activeNotesRef.current.clear();
                return !r;
              });
            }}
            title={
              isRecording
                ? 'Stop recording'
                : 'Record MIDI to selected track (requires playback)'
            }
          >
            {isRecording ? '⏹ Stop' : '⏺ Record'}
          </button>
        </>
      ) : (
        <button className="midi-status__connect-btn" onClick={connect}>
          Connect MIDI
        </button>
      )}
      {error && (
        <span className="midi-status__error" title={error}>
          ⚠
        </span>
      )}
    </div>
  );
}
