import { useState } from 'react';
import { ViewSwitch } from '../components/ViewSwitch';
import type { View } from '../components/ViewSwitch';
import { useViewShortcuts } from '../shortcuts';
import './CueView.css';

interface CueViewProps {
  /** In front: its shortcuts are the ones that fire. */
  active: boolean;
  onViewChange: (view: View) => void;
}

/** Edits cue documents: short sound effects, played on the audio clock. Never the song. */
export function CueView({ active, onViewChange }: CueViewProps) {
  const [status, setStatus] = useState('');

  // While this view is in front, its keys never reach the song
  useViewShortcuts(
    {
      togglePlay: () => setStatus('Open a cue file to play its cues.'),
      undo: () => {},
      redo: () => {},
      save: () => setStatus('Nothing to save: no cue file is open.'),
    },
    active
  );

  return (
    <div className="app cue-view">
      <header className="app-header">
        <div className="app-header-left">
          <h1>Soundscape</h1>
          <ViewSwitch view="cues" onChange={onViewChange} />
        </div>
      </header>
      <main className="cue-empty">
        <p>Open a cue file to edit its cues.</p>
      </main>
      <p className="cue-status" role="status">
        {status}
      </p>
    </div>
  );
}
