import { useMemo } from 'react';
import { useSoundscape } from '../state';
import { createRuntimeAPI } from '../api';
import type { SoundscapeRuntimeAPI } from '../api';

/**
 * Hook to access the Soundscape runtime API for game integration
 */
export function useRuntimeAPI(): SoundscapeRuntimeAPI {
  const { state, dispatch, playback, play, stop, setTempo, setLoop } = useSoundscape();

  const api = useMemo(
    () =>
      createRuntimeAPI(
        dispatch,
        () => ({
          mixer: state.mixer,
          playback,
        }),
        { play, stop, setTempo, setLoop }
      ),
    [dispatch, state.mixer, playback, play, stop, setTempo, setLoop]
  );

  return api;
}
