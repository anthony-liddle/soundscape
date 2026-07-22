import { useState, useCallback, useRef, useEffect } from 'react';

export interface MIDIInputOptions {
  onNoteOn: (pitch: number, velocity: number) => void;
  onNoteOff: (pitch: number) => void;
}

export interface MIDIInputState {
  /** Whether this browser implements Web MIDI (Safari does not). */
  isSupported: boolean;
  isConnected: boolean;
  error: string | null;
  deviceNames: string[];
  /** Request MIDI access. Must be called from a user gesture. */
  connect: () => Promise<void>;
}

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

/**
 * Web MIDI input: connect on demand, listen to every input device, and
 * surface note events. Handles hot-plug via statechange and treats a
 * note-on with velocity 0 as note-off (common keyboard behavior).
 */
export function useMIDIInput({ onNoteOn, onNoteOff }: MIDIInputOptions): MIDIInputState {
  const isSupported =
    typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  const accessRef = useRef<MIDIAccess | null>(null);

  // Device handlers live for the whole connection; route through refs so
  // they always call the latest callbacks instead of stale closures.
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
    onNoteOffRef.current = onNoteOff;
  }, [onNoteOn, onNoteOff]);

  const handleMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;
    const status = data[0]! & 0xf0; // high nibble: message type, low: channel
    if (status !== NOTE_ON && status !== NOTE_OFF) return;

    const pitch = data[1]!;
    const velocity = data[2]!;
    if (status === NOTE_ON && velocity > 0) {
      onNoteOnRef.current(pitch, velocity);
    } else {
      onNoteOffRef.current(pitch);
    }
  }, []);

  const attachInputs = useCallback(
    (access: MIDIAccess) => {
      const names: string[] = [];
      for (const input of access.inputs.values()) {
        input.onmidimessage = handleMessage;
        names.push(input.name ?? 'Unknown device');
      }
      setDeviceNames(names);
    },
    [handleMessage]
  );

  const connect = useCallback(async () => {
    if (!isSupported) return;
    try {
      const access = await navigator.requestMIDIAccess();
      accessRef.current = access;
      // Re-attach on hot-plug so new devices are heard immediately
      access.onstatechange = () => attachInputs(access);
      attachInputs(access);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsConnected(false);
    }
  }, [isSupported, attachInputs]);

  // Detach everything on unmount
  useEffect(() => {
    return () => {
      const access = accessRef.current;
      if (access) {
        access.onstatechange = null;
        for (const input of access.inputs.values()) {
          input.onmidimessage = null;
        }
      }
    };
  }, []);

  return { isSupported, isConnected, error, deviceNames, connect };
}
