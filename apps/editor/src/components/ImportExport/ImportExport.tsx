import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useSoundscape } from '../../state';
import { Button } from '../common';
import { validateSoundscapeState, builtInPresets } from 'soundscape-engine';
import type { SoundscapeState } from 'soundscape-engine';
import { exportSoundscape } from '../../utils/exportSoundscape';
import { migrateSoundscapeState } from '../../state/migrate';
import './ImportExport.css';

export function ImportExport() {
  const { state, dispatch, stop } = useSoundscape();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => exportSoundscape(state);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Handle both old format (with presets) and new format (without presets)
        const stateToLoad: SoundscapeState = {
          metadata: parsed.metadata,
          tracks: parsed.tracks,
          patterns: parsed.patterns ?? [],
          arrangement: parsed.arrangement ?? [],
          mixer: parsed.mixer,
          // Use imported presets if present, otherwise use built-in presets
          presets: parsed.presets || [...builtInPresets],
        };

        if (!validateSoundscapeState(stateToLoad)) {
          alert('Invalid soundscape file format');
          return;
        }

        // Stop playback before loading new state
        stop();

        dispatch({ type: 'SET_STATE', payload: migrateSoundscapeState(stateToLoad) });
      } catch (err) {
        alert('Failed to parse file: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="import-export">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <Button variant="secondary" onClick={handleImportClick}>
        Import
      </Button>

      <Button variant="primary" onClick={handleExport}>
        Export
      </Button>
    </div>
  );
}
