import { useState, useCallback, useRef, useEffect } from 'react';

export interface MIDIInputOptions {
  onNoteOn: (pitch: number, velocity: number) => void;
  onNoteOff: (pitch: number) => void;
}

export interface MIDIInputState {
  isSupported: boolean;
  isConnected: boolean;
  error: string | null;
  deviceNames: string[];
  connect: () => Promise<void>;
}

function handleMIDIMessage(
  data: Uint8Array,
  onNoteOn: (pitch: number, velocity: number) => void,
  onNoteOff: (pitch: number) => void,
): void {
  const status = data[0];
  const pitch = data[1];
  const velocity = data[2];
  if (status === undefined || pitch === undefined || velocity === undefined)
    return;

  const isNoteOn = (status & 0xf0) === 0x90;
  const isNoteOff = (status & 0xf0) === 0x80;

  if (isNoteOn && velocity > 0) {
    onNoteOn(pitch, velocity);
  } else if (isNoteOff || (isNoteOn && velocity === 0)) {
    onNoteOff(pitch);
  }
}

export function useMIDIInput({
  onNoteOn,
  onNoteOff,
}: MIDIInputOptions): MIDIInputState {
  const isSupported =
    typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceNames, setDeviceNames] = useState<string[]>([]);

  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  // Keep refs up to date without triggering re-renders
  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
    onNoteOffRef.current = onNoteOff;
  });

  const connect = useCallback(async () => {
    if (!isSupported) return;
    try {
      const nav = navigator as Navigator & {
        requestMIDIAccess: () => Promise<MIDIAccess>;
      };
      const access = await nav.requestMIDIAccess();

      const attachListeners = () => {
        const names: string[] = [];
        for (const input of access.inputs.values()) {
          if (input.name) names.push(input.name);
          input.onmidimessage = (event: MIDIMessageEvent) => {
            if (!event.data) return;
            handleMIDIMessage(event.data, onNoteOnRef.current, onNoteOffRef.current);
          };
        }
        setDeviceNames(names);
        setIsConnected(true);
      };

      attachListeners();
      access.onstatechange = () => attachListeners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MIDI access denied');
    }
  }, [isSupported]); // stable — only changes if support changes

  return { isSupported, isConnected, error, deviceNames, connect };
}
