import { useState, useRef, useEffect, useCallback } from 'react';
import type { Track } from 'soundscape-engine';
import { useSoundscape } from '../../state';
import { useMIDIInput } from '../../hooks/useMIDIInput';
import { createMidiRecorder } from '../../utils/midiRecorder';
import type { MidiRecorder } from '../../utils/midiRecorder';
import { Button } from '../common';
import './MIDIStatus.css';

const RECORD_GRID = 0.25; // quantize recordings to 1/16 notes

interface MIDIStatusProps {
  /** Track that auditions incoming notes and receives recordings. */
  track: Track | null;
}

/**
 * MIDI connection status, note audition, and recording.
 *
 * Incoming notes always audition through the selected track's instrument.
 * When record is armed and the transport is playing, notes are stamped with
 * the engine playhead and committed as ONE batched action (one undo step)
 * when recording ends — via disarm or transport stop.
 */
export function MIDIStatus({ track }: MIDIStatusProps) {
  const { state, dispatch, playback, startNote, stopNote, getCurrentBeat } = useSoundscape();
  const [recordArmed, setRecordArmed] = useState(false);
  const [lastPitch, setLastPitch] = useState<number | null>(null);
  const recorderRef = useRef<MidiRecorder | null>(null);

  // Capture the audition target at note-on time so a held note releases
  // cleanly even if the selection changes mid-note
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  // Recording session lifecycle: starts when armed while playing, ends (and
  // commits) on disarm or transport stop
  const recording = recordArmed && playback.isPlaying;
  useEffect(() => {
    if (recording && !recorderRef.current) {
      recorderRef.current = createMidiRecorder({
        grid: RECORD_GRID,
        loopLengthBeats: state.metadata.lengthBeats,
      });
    } else if (!recording && recorderRef.current) {
      const notes = recorderRef.current.finish(getCurrentBeat());
      recorderRef.current = null;
      const target = trackRef.current;
      if (notes.length > 0 && target) {
        dispatch({ type: 'ADD_NOTES', payload: { trackId: target.id, notes } });
      }
    }
  }, [recording, state.metadata.lengthBeats, getCurrentBeat, dispatch]);

  const handleNoteOn = useCallback(
    (pitch: number, velocity: number) => {
      const target = trackRef.current;
      if (target) {
        startNote(pitch, velocity, target.presetId, target.paramOverrides);
      }
      recorderRef.current?.noteOn(pitch, velocity, getCurrentBeat());
      setLastPitch(pitch);
    },
    [startNote, getCurrentBeat]
  );

  const handleNoteOff = useCallback(
    (pitch: number) => {
      stopNote(pitch);
      recorderRef.current?.noteOff(pitch, getCurrentBeat());
    },
    [stopNote, getCurrentBeat]
  );

  const midi = useMIDIInput({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff });

  if (!midi.isSupported) {
    return (
      <span className="midi-status midi-status-unsupported" title="Web MIDI is not available in this browser (try Chrome, Edge, or Firefox)">
        MIDI unavailable
      </span>
    );
  }

  if (!midi.isConnected) {
    return (
      <div className="midi-status">
        <Button variant="secondary" size="small" onClick={() => void midi.connect()}>
          Connect MIDI
        </Button>
        {midi.error && <span className="midi-status-error">{midi.error}</span>}
      </div>
    );
  }

  return (
    <div className="midi-status">
      <span className="midi-status-device" title={midi.deviceNames.join(', ')}>
        <span className={`midi-status-dot ${lastPitch !== null ? 'active' : ''}`} />
        {midi.deviceNames[0] ?? 'MIDI'}
        {midi.deviceNames.length > 1 ? ` +${midi.deviceNames.length - 1}` : ''}
      </span>
      <Button
        variant={recordArmed ? 'danger' : 'secondary'}
        size="small"
        active={recordArmed}
        disabled={!track}
        onClick={() => setRecordArmed((armed) => !armed)}
        title={
          recordArmed
            ? 'Recording armed — notes record to the selected track while playing'
            : 'Arm MIDI recording'
        }
      >
        {recording ? '● REC' : recordArmed ? '● Armed' : 'Record'}
      </Button>
    </div>
  );
}
