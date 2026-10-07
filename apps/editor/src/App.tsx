import { useCallback, useState } from 'react';
import { SoundscapeProvider, useSoundscape } from './state';
import { Transport } from './components/Transport';
import { TrackList } from './components/TrackList';
import { NoteEditor } from './components/NoteEditor';
import type { Subdivision } from './components/NoteEditor';
import { InstrumentPanel } from './components/InstrumentPanel';
import { ImportExport } from './components/ImportExport';
import { MIDIStatus, RECORD_GRID } from './components/MIDIStatus';
import type { RecordingPreview } from './components/MIDIStatus';

import { ViewSwitch } from './components/ViewSwitch';
import type { View } from './components/ViewSwitch';
import { CueView, useCueEditor } from './cues';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsProvider } from './shortcuts';
import { viewFromSearch, writeViewToAddress } from './view';
import './App.css';

interface SoundscapeAppProps {
  /** In front: its shortcuts, and the piano roll's, are the ones that fire. */
  active?: boolean;
  /** Shows the view switch in the header when given. */
  onViewChange?: (view: View) => void;
  /** Where Import sends a cue file. */
  onOpenCues?: (file: { name: string; text: string }) => void;
}

export function SoundscapeApp({ active = true, onViewChange, onOpenCues }: SoundscapeAppProps = {}) {
  const { state, dispatch, playback, play, stop, undo, redo, canUndo, canRedo, analyserNode } = useSoundscape();
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    state.tracks.length > 0 ? (state.tracks[0]?.id ?? null) : null
  );

  const selectedTrack = state.tracks.find((t) => t.id === selectedTrackId) || null;

  // Owned here so a committed MIDI take can widen the piano roll: notes land
  // on RECORD_GRID, and a coarser resolution has no cell to draw them in
  const [subdivision, setSubdivision] = useState<Subdivision>(1);

  // Display-only notes from a MIDI take in progress; never dispatched
  const [preview, setPreview] = useState<RecordingPreview | null>(null);

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
    active,
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_METADATA', payload: { name: e.target.value } });
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <h1>Soundscape</h1>
          {onViewChange && <ViewSwitch view="song" onChange={onViewChange} />}
          <span className="app-title-separator" aria-hidden="true">/</span>
          <input
            type="text"
            className="app-title-input"
            value={state.metadata.name}
            onChange={handleNameChange}
            placeholder="Untitled"
          />
        </div>
        <div className="app-header-right">
          <MIDIStatus
            track={selectedTrack}
            onRecordingGrid={() => setSubdivision(RECORD_GRID)}
            onPreviewChange={setPreview}
          />
          <ImportExport {...(onOpenCues && { onOpenCues })} />
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
          <NoteEditor
            key={selectedTrack?.id ?? 'empty'}
            track={selectedTrack}
            active={active}
            subdivision={subdivision}
            onSubdivisionChange={setSubdivision}
            previewNotes={
              preview && preview.trackId === selectedTrack?.id
                ? preview.notes
                : []
            }
          />
          <InstrumentPanel track={selectedTrack} analyserNode={analyserNode} />
        </main>
      </div>
    </div>
  );
}

/**
 * The song and the cues, one view in front at a time, named in the address as
 * `?view=cues`. The song view stays mounted while hidden, so it comes back
 * exactly as it was: its track, its piano roll's resolution, any take in
 * progress. The cue view mounts the first time it is shown, then stays.
 */
function App() {
  const [view, setView] = useState<View>(() => viewFromSearch(window.location.search));
  const [cuesShown, setCuesShown] = useState(view === 'cues');
  const cues = useCueEditor();
  const { openText } = cues;

  const show = useCallback((next: View) => {
    writeViewToAddress(next);
    setView(next);
    if (next === 'cues') setCuesShown(true);
  }, []);

  const openCues = useCallback(
    ({ name, text }: { name: string; text: string }) => {
      if (openText(text, name)) show('cues');
    },
    [openText, show]
  );

  return (
    <SoundscapeProvider>
      <ShortcutsProvider>
        <div className="app-view" hidden={view !== 'song'}>
          <SoundscapeApp active={view === 'song'} onViewChange={show} onOpenCues={openCues} />
        </div>
        {cuesShown && (
          <div className="app-view" hidden={view !== 'cues'}>
            <CueView cues={cues} active={view === 'cues'} onViewChange={show} />
          </div>
        )}
      </ShortcutsProvider>
    </SoundscapeProvider>
  );
}

export default App;
