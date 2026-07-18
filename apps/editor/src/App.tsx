import { useState } from 'react';
import { SoundscapeProvider, useSoundscape } from './state';
import { Transport } from './components/Transport';
import { TrackList } from './components/TrackList';
import { NoteEditor } from './components/NoteEditor';
import { InstrumentPanel } from './components/InstrumentPanel';
import { ImportExport } from './components/ImportExport';
import { MIDIStatus } from './components/MIDIStatus';

import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

function SoundscapeApp() {
  const { state, dispatch, playback, play, stop, undo, redo, canUndo, canRedo, analyserNode } = useSoundscape();
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    state.tracks.length > 0 ? (state.tracks[0]?.id ?? null) : null
  );

  const selectedTrack = state.tracks.find((t) => t.id === selectedTrackId) || null;

  useKeyboardShortcuts({
    isPlaying: playback.isPlaying,
    play,
    stop,
    undo,
    redo,
    canUndo,
    canRedo,
    state,
    selectedTrackId,
    dispatch,
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_METADATA', payload: { name: e.target.value } });
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <h1>Soundscape</h1>
          <span className="app-title-separator">—</span>
          <input
            type="text"
            className="app-title-input"
            value={state.metadata.name}
            onChange={handleNameChange}
            placeholder="Untitled"
          />
        </div>
        <div className="app-header-right">
          <MIDIStatus track={selectedTrack} />
          <ImportExport />
        </div>
      </header>

      <div className="app-transport">
        <Transport />
      </div>

      <div className="app-content">
        <aside className="app-sidebar">
          <TrackList
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
          />
        </aside>

        <main className="app-main">
          <NoteEditor key={selectedTrack?.id ?? 'empty'} track={selectedTrack} />
          <InstrumentPanel track={selectedTrack} analyserNode={analyserNode} />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <SoundscapeProvider>
      <SoundscapeApp />
    </SoundscapeProvider>
  );
}

export default App;
