import { createContext } from 'react';
import type { Dispatch } from 'react';
import type { SoundscapeState, PlaybackState, InstrumentParams } from 'soundscape-engine';
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
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  analyserNode: AnalyserNode | null;
}

export const SoundscapeContext = createContext<SoundscapeContextValue | null>(null);
