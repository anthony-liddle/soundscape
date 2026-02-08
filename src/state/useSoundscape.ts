import { useContext } from 'react';
import { SoundscapeContext } from './context';
import type { SoundscapeContextValue } from './context';

export function useSoundscape(): SoundscapeContextValue {
  const context = useContext(SoundscapeContext);
  if (!context) {
    throw new Error('useSoundscape must be used within a SoundscapeProvider');
  }
  return context;
}
