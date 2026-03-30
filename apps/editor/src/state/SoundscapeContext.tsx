import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlaybackState, InstrumentParams, SoundscapeState } from 'soundscape-engine';
import { soundscapeReducer, createInitialState } from './reducer';
import type { SoundscapeAction } from './reducer';
import { AudioEngine } from 'soundscape-engine';
import { SoundscapeContext } from './context';
import type { SoundscapeContextValue } from './context';

const MAX_HISTORY = 50;

export function SoundscapeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(soundscapeReducer, null, createInitialState);
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentBeat: 0,
    loop: true,
  });
  const [past, setPast] = useState<SoundscapeState[]>([]);
  const [future, setFuture] = useState<SoundscapeState[]>([]);

  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const stateRef = useRef(state);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchWithHistory = useCallback((action: SoundscapeAction) => {
    setPast((prev) => {
      const next = [...prev, stateRef.current];
      return next.length > MAX_HISTORY ? next.slice(1) : next;
    });
    setFuture([]);
    dispatch(action);
  }, []);

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      if (!previous) return prev;
      setFuture((f) => [stateRef.current, ...f]);
      dispatch({ type: 'SET_STATE', payload: previous });
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...remaining] = prev;
      if (!next) return prev;
      setPast((p) => [...p, stateRef.current]);
      dispatch({ type: 'SET_STATE', payload: next });
      return remaining;
    });
  }, []);

  // Initialize audio engine
  useEffect(() => {
    const engine = new AudioEngine();
    audioEngineRef.current = engine;

    engine.initialize().then(() => {
      engine.updateState(stateRef.current);
      setAnalyserNode(engine.getAnalyserNode());
    });

    const unsubBeat = engine.onBeatUpdate((beat) => {
      setPlayback((prev) => ({ ...prev, currentBeat: beat }));
    });

    return () => {
      unsubBeat();
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
    dispatchWithHistory({ type: 'SET_METADATA', payload: { tempo: bpm } });
  }, [dispatchWithHistory]);

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
    dispatch: dispatchWithHistory,
    playback,
    play,
    stop,
    setTempo,
    setLoop,
    previewNote,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    analyserNode,
  };

  return (
    <SoundscapeContext.Provider value={value}>
      {children}
    </SoundscapeContext.Provider>
  );
}
