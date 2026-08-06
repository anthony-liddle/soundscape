import { useState, useRef, useEffect, useCallback } from 'react';
import type { Track } from 'soundscape-engine';
import { useSoundscape } from '../../state';
import { useMIDIInput } from '../../hooks/useMIDIInput';
import { createMidiRecorder } from '../../utils/midiRecorder';
import type { MidiRecorder } from '../../utils/midiRecorder';
import type { NoteInput } from '../../state';
import { Button } from '../common';
import './MIDIStatus.css';

/** Recordings quantize to 1/16 notes. */
export const RECORD_GRID = 0.25;

interface MIDIStatusProps {
  /** Track that auditions incoming notes and receives recordings. */
  track: Track | null;
  /**
   * Called with {@link RECORD_GRID} when a recording starts, and again when a
   * take commits, so the editor can show a resolution fine enough to render
   * what is being recorded.
   */
  onRecordingGrid?: (grid: number) => void;
  /**
   * The take in progress, for display only — nothing here has been dispatched,
   * so it stays out of undo history until the take commits. `null` clears it.
   */
  onPreviewChange?: (preview: RecordingPreview | null) => void;
}

/** Notes recorded so far in the current take, and where they will land. */
export interface RecordingPreview {
  trackId: string;
  notes: NoteInput[];
}

/**
 * MIDI connection status, note audition, and recording.
 *
 * Incoming notes always audition through the selected track's instrument.
 * When record is armed and the transport is playing, notes are stamped with
 * the engine playhead and committed as ONE batched action (one undo step)
 * when recording ends — via disarm or transport stop.
 */
export function MIDIStatus({
  track,
  onRecordingGrid,
  onPreviewChange,
}: MIDIStatusProps) {
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

  // Held in a ref so an inline callback from the parent doesn't re-run the
  // recording lifecycle effect on every render
  const onRecordingGridRef = useRef(onRecordingGrid);
  const onPreviewChangeRef = useRef(onPreviewChange);
  useEffect(() => {
    onRecordingGridRef.current = onRecordingGrid;
    onPreviewChangeRef.current = onPreviewChange;
  }, [onRecordingGrid, onPreviewChange]);

  // The take belongs to whichever track was selected when recording started.
  // Distinct from trackRef, which follows the selection so a held note releases
  // against the instrument that started it.
  const recordingTrackIdRef = useRef<string | null>(null);

  // Publish the take as it stands. Nothing is dispatched, so the preview never
  // enters undo history — it becomes real notes only when the take commits.
  const publishPreview = useCallback(() => {
    const trackId = recordingTrackIdRef.current;
    const recorder = recorderRef.current;
    if (!trackId || !recorder) return;
    onPreviewChangeRef.current?.({
      trackId,
      notes: recorder.snapshot(getCurrentBeat()),
    });
  }, [getCurrentBeat]);

  // Recording session lifecycle: starts when armed while playing, ends (and
  // commits) on disarm or transport stop
  const recording = recordArmed && playback.isPlaying;
  useEffect(() => {
    if (recording && !recorderRef.current) {
      recorderRef.current = createMidiRecorder({
        grid: RECORD_GRID,
        loopLengthBeats: state.metadata.lengthBeats,
      });
      recordingTrackIdRef.current = trackRef.current?.id ?? null;
      // Show the recording resolution up front, so notes are visible as they
      // land rather than appearing only once the take commits
      onRecordingGridRef.current?.(RECORD_GRID);
    } else if (!recording && recorderRef.current) {
      const notes = recorderRef.current.finish(getCurrentBeat());
      recorderRef.current = null;
      const trackId = recordingTrackIdRef.current;
      recordingTrackIdRef.current = null;
      if (notes.length > 0 && trackId) {
        dispatch({ type: 'ADD_NOTES', payload: { trackId, notes } });
        // Re-assert on commit: the resolution may have been changed by hand
        // mid-take, and a coarser grid has no cell to draw these notes in
        onRecordingGridRef.current?.(RECORD_GRID);
      }
      // The take is now real notes (or was empty) — drop the preview
      onPreviewChangeRef.current?.(null);
    }
  }, [recording, state.metadata.lengthBeats, getCurrentBeat, dispatch]);

  // Grow held notes as the transport advances. The context's playback object
  // changes on every beat tick, so this re-publishes at that cadence.
  useEffect(() => {
    if (recording) publishPreview();
  }, [recording, playback.currentBeat, publishPreview]);

  const handleNoteOn = useCallback(
    (pitch: number, velocity: number) => {
      const target = trackRef.current;
      if (target) {
        startNote(pitch, velocity, target.presetId, target.paramOverrides);
      }
      recorderRef.current?.noteOn(pitch, velocity, getCurrentBeat());
      publishPreview();
      setLastPitch(pitch);
    },
    [startNote, getCurrentBeat, publishPreview]
  );

  const handleNoteOff = useCallback(
    (pitch: number) => {
      stopNote(pitch);
      recorderRef.current?.noteOff(pitch, getCurrentBeat());
      publishPreview();
    },
    [stopNote, getCurrentBeat, publishPreview]
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
        <Button variant="secondary" onClick={() => void midi.connect()}>
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
