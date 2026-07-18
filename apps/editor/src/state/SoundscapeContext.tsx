import { useReducer, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { PlaybackState, InstrumentParams } from 'soundscape-engine';
import { AudioEngine } from 'soundscape-engine';
import { historyReducer, createInitialHistory } from './history';
import { SoundscapeContext } from './context';
import type { SoundscapeContextValue } from './context';

export function SoundscapeProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, null, createInitialHistory);
  const state = history.present;

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentBeat: 0,
    loop: true,
  });

  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const stateRef = useRef(state);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  // Initialize audio engine
  useEffect(() => {
    const engine = new AudioEngine();
    audioEngineRef.current = engine;
    let cancelled = false;

    engine.initialize().then(() => {
      // Guard against the effect being cleaned up (unmount, StrictMode
      // remount) before initialization resolved — the engine is destroyed
      // and calling into it would throw.
      if (cancelled) return;
      engine.updateState(stateRef.current);
      setAnalyserNode(engine.getAnalyserNode());
    });

    // The engine emits beat updates per scheduler tick (~344 Hz with the
    // AudioWorklet scheduler). Coalesce to one state update per animation
    // frame — the display can't show more, and each setPlayback re-renders
    // the whole consumer tree.
    let rafId = 0;
    let latestBeat = 0;
    const unsubBeat = engine.onBeatUpdate((beat) => {
      latestBeat = beat;
      if (rafId === 0) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          setPlayback((prev) => ({ ...prev, currentBeat: latestBeat }));
        });
      }
    });

    return () => {
      cancelled = true;
      unsubBeat();
      if (rafId !== 0) cancelAnimationFrame(rafId);
      engine.destroy();
      audioEngineRef.current = null;
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

  const startNote = useCallback(
    (pitch: number, velocity: number, presetId: string, paramOverrides?: Partial<InstrumentParams>) => {
      const engine = audioEngineRef.current;
      if (engine) {
        void engine.resume();
        engine.startMIDINote(pitch, velocity, presetId, paramOverrides);
      }
    },
    []
  );

  const stopNote = useCallback((pitch: number) => {
    audioEngineRef.current?.stopMIDINote(pitch);
  }, []);

  const getCurrentBeat = useCallback(() => audioEngineRef.current?.getCurrentBeat() ?? 0, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const value: SoundscapeContextValue = useMemo(
    () => ({
      state,
      dispatch,
      playback,
      play,
      stop,
      setTempo,
      setLoop,
      previewNote,
      startNote,
      stopNote,
      getCurrentBeat,
      undo,
      redo,
      canUndo,
      canRedo,
      analyserNode,
    }),
    [state, playback, play, stop, setTempo, setLoop, previewNote, startNote, stopNote, getCurrentBeat, undo, redo, canUndo, canRedo, analyserNode]
  );

  return (
    <SoundscapeContext.Provider value={value}>
      {children}
    </SoundscapeContext.Provider>
  );
}
