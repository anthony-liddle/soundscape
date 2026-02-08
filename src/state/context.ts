import { createContext } from 'react';
import type { Dispatch } from 'react';
import type { SoundscapeState, PlaybackState, InstrumentParams } from '../types';
import type { SoundscapeAction } from './reducer';

export interface SoundscapeContextValue {
  state: SoundscapeState;
  dispatch: Dispatch<SoundscapeAction>;
  playback: PlaybackState;
  play: (startBeat?: number) => void;
  stop: () => void;
  setTempo: (bpm: number) => void;
  setLoop: (enabled: boolean) => void;
  previewNote: (pitch: number, velocity: number, presetId: string, paramOverrides?: Partial<InstrumentParams>) => void;
}

export const SoundscapeContext = createContext<SoundscapeContextValue | null>(null);
