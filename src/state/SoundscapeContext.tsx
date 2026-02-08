import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type { ReactNode, Dispatch } from 'react';
import type { SoundscapeState, PlaybackState, InstrumentParams } from '../types';
import type { SoundscapeAction } from './reducer';
import { soundscapeReducer, createInitialState } from './reducer';
import { AudioEngine } from '../audio';

interface SoundscapeContextValue {
  state: SoundscapeState;
  dispatch: Dispatch<SoundscapeAction>;
  playback: PlaybackState;
  play: (startBeat?: number) => void;
  stop: () => void;
  setTempo: (bpm: number) => void;
  setLoop: (enabled: boolean) => void;
  previewNote: (pitch: number, velocity: number, presetId: string, paramOverrides?: Partial<InstrumentParams>) => void;
  audioEngine: AudioEngine | null;
}

const SoundscapeContext = createContext<SoundscapeContextValue | null>(null);

export function SoundscapeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(soundscapeReducer, null, createInitialState);
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentBeat: 0,
    loop: true,
  });

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const stateRef = useRef(state);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize audio engine
  useEffect(() => {
    const engine = new AudioEngine();
    audioEngineRef.current = engine;

    engine.initialize().then(() => {
      engine.updateState(stateRef.current);
    });

    engine.onBeatUpdate((beat) => {
      setPlayback((prev) => ({ ...prev, currentBeat: beat }));
    });

    return () => {
      engine.destroy();
    };
  }, []);

  // Update engine when state changes
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (engine) {
      engine.updateState(state);
    }
  }, [state]);

  const play = useCallback(async (startBeat: number = 0) => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    await engine.resume();
    engine.play(startBeat);
    setPlayback((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const stop = useCallback(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    engine.stop();
    setPlayback((prev) => ({ ...prev, isPlaying: false, currentBeat: 0 }));
  }, []);

  const setTempo = useCallback((bpm: number) => {
    const engine = audioEngineRef.current;
    if (engine) {
      engine.setTempo(bpm);
    }
    dispatch({ type: 'SET_METADATA', payload: { tempo: bpm } });
  }, []);

  const setLoop = useCallback((enabled: boolean) => {
    const engine = audioEngineRef.current;
    if (engine) {
      engine.setLoop(enabled);
    }
    setPlayback((prev) => ({ ...prev, loop: enabled }));
  }, []);

  const previewNote = useCallback(
    (pitch: number, velocity: number, presetId: string, paramOverrides?: Partial<InstrumentParams>) => {
      const engine = audioEngineRef.current;
      if (engine) {
        engine.previewNote(pitch, velocity, presetId, paramOverrides);
      }
    },
    []
  );

  const value: SoundscapeContextValue = {
    state,
    dispatch,
    playback,
    play,
    stop,
    setTempo,
    setLoop,
    previewNote,
    audioEngine: audioEngineRef.current,
  };

  return (
    <SoundscapeContext.Provider value={value}>
      {children}
    </SoundscapeContext.Provider>
  );
}

export function useSoundscape(): SoundscapeContextValue {
  const context = useContext(SoundscapeContext);
  if (!context) {
    throw new Error('useSoundscape must be used within a SoundscapeProvider');
  }
  return context;
}
