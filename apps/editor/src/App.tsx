import { useState } from 'react';
import { SoundscapeProvider, useSoundscape } from './state';
import { Transport } from './components/Transport';
import { TrackList } from './components/TrackList';
import { NoteEditor } from './components/NoteEditor';
import { InstrumentPanel } from './components/InstrumentPanel';
import { ImportExport } from './components/ImportExport';
import { PatternList } from './components/PatternList/PatternList';
import { ArrangementView } from './components/ArrangementView/ArrangementView';
import type { Pattern } from 'soundscape-engine';

import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

function SoundscapeApp() {
  const { state, dispatch, playback, play, stop, undo, redo, canUndo, canRedo, analyserNode } = useSoundscape();
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    state.tracks.length > 0 ? (state.tracks[0]?.id ?? null) : null
  );

  const selectedTrack = state.tracks.find((t) => t.id === selectedTrackId) || null;

  const [activePatternId, setActivePatternId] = useState<string | null>(
    selectedTrack?.patterns[0]?.id ?? null
  );

  const activePattern: Pattern | null =
    selectedTrack?.patterns.find((p) => p.id === activePatternId) ??
    selectedTrack?.patterns[0] ??
    null;

  const handleSelectTrack = (trackId: string) => {
    setSelectedTrackId(trackId);
    const track = state.tracks.find((t) => t.id === trackId);
    setActivePatternId(track?.patterns[0]?.id ?? null);
  };

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
          <ImportExport />
        </div>
      </header>

      <div className="app-transport">
        <Transport />
      </div>

      <div className="app-arrangement">
        <ArrangementView
          activePatternId={activePatternId}
          selectedTrackId={selectedTrackId}
          onSelectTrack={handleSelectTrack}
        />
      </div>

      <div className="app-content">
        <aside className="app-sidebar">
          <TrackList
            selectedTrackId={selectedTrackId}
            onSelectTrack={handleSelectTrack}
          />
          <PatternList
            track={selectedTrack}
            activePatternId={activePatternId}
            onPatternSelect={setActivePatternId}
          />
        </aside>

        <main className="app-main">
          <NoteEditor
            key={`${selectedTrack?.id ?? 'empty'}-${activePattern?.id ?? 'empty'}`}
            track={selectedTrack}
            pattern={activePattern}
          />
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
