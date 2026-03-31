import { useCallback } from 'react';
import { useSoundscape } from '../../state';
import { useMIDIInput } from '../../hooks/useMIDIInput';
import type { Track } from 'soundscape-engine';
import './MIDIStatus.css';

interface MIDIStatusProps {
  selectedTrack: Track | null;
}

export function MIDIStatus({ selectedTrack }: MIDIStatusProps) {
  const { startNote, stopNote } = useSoundscape();

  const onNoteOn = useCallback(
    (pitch: number, velocity: number) => {
      if (!selectedTrack) return;
      startNote(pitch, velocity, selectedTrack.presetId, selectedTrack.paramOverrides);
    },
    [selectedTrack, startNote],
  );

  const onNoteOff = useCallback((pitch: number) => stopNote(pitch), [stopNote]);

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
        <span
          className="midi-status__connected"
          title={deviceNames.join(', ') || 'Connected'}
        >
          MIDI ●{' '}
          {deviceNames.length > 0 ? deviceNames[0] : 'connected'}
          {deviceNames.length > 1 ? ` +${deviceNames.length - 1}` : ''}
        </span>
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
