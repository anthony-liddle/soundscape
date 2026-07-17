import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useSoundscape } from '../../state';
import { Button } from '../common';
import { validateSoundscapeState, builtInPresets } from 'soundscape-engine';
import type { SoundscapeState } from 'soundscape-engine';
import { exportSoundscape } from '../../utils/exportSoundscape';
import { repairSoundscapeState } from '../../utils/repairSoundscape';
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
          mixer: parsed.mixer,
          // Use imported presets if present, otherwise use built-in presets
          presets: parsed.presets || [...builtInPresets],
        };

        if (!validateSoundscapeState(stateToLoad)) {
          // Offer a repaired version instead of hard-failing on one bad value
          const repaired = repairSoundscapeState(parsed);
          if (repaired && repaired.repairs.length > 0) {
            const proceed = confirm(
              'This file has problems that can be repaired:\n\n' +
                repaired.repairs.map((r) => `• ${r}`).join('\n') +
                '\n\nLoad the repaired project?'
            );
            if (proceed) {
              stop();
              dispatch({ type: 'SET_STATE', payload: repaired.state });
            }
            return;
          }
          alert('Invalid soundscape file format');
          return;
        }

        // Stop playback before loading new state
        stop();

        dispatch({ type: 'SET_STATE', payload: stateToLoad });
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
