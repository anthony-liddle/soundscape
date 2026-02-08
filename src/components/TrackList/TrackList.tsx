import { useSoundscape } from '../../state';
import { Button, Select } from '../common';
import './TrackList.css';

interface TrackListProps {
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
}

export function TrackList({ selectedTrackId, onSelectTrack }: TrackListProps) {
  const { state, dispatch } = useSoundscape();

  const handleAddTrack = () => {
    const trackNumber = state.tracks.length + 1;
    dispatch({
      type: 'ADD_TRACK',
      payload: { name: `Track ${trackNumber}`, presetId: 'lead' },
    });
  };

  const handleRemoveTrack = (trackId: string) => {
    if (state.tracks.length <= 1) return;
    dispatch({ type: 'REMOVE_TRACK', payload: { trackId } });
    if (selectedTrackId === trackId) {
      const remaining = state.tracks.filter((t) => t.id !== trackId);
      if (remaining.length > 0) {
        onSelectTrack(remaining[0].id);
      }
    }
  };

  const handlePresetChange = (trackId: string, presetId: string) => {
    dispatch({ type: 'SET_TRACK_PRESET', payload: { trackId, presetId } });
  };

  const handleTrackNameChange = (trackId: string, name: string) => {
    dispatch({ type: 'UPDATE_TRACK', payload: { trackId, updates: { name } } });
  };

  const presetOptions = state.presets.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div className="track-list">
      <div className="track-list-header">
        <h3>Tracks</h3>
        <Button size="small" onClick={handleAddTrack}>
          + Add Track
        </Button>
      </div>

      <div className="track-list-items">
        {state.tracks.map((track) => (
          <div
            key={track.id}
            className={`track-item ${selectedTrackId === track.id ? 'track-item-selected' : ''}`}
            onClick={() => onSelectTrack(track.id)}
          >
            <div className="track-item-info">
              <input
                type="text"
                className="track-item-name-input"
                value={track.name}
                onChange={(e) => handleTrackNameChange(track.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="track-item-notes">{track.notes.length} notes</span>
            </div>

            <div className="track-item-controls" onClick={(e) => e.stopPropagation()}>
              <Select
                value={track.presetId}
                options={presetOptions}
                onChange={(presetId) => handlePresetChange(track.id, presetId)}
              />
              <Button
                variant="danger"
                size="small"
                onClick={() => handleRemoveTrack(track.id)}
                disabled={state.tracks.length <= 1}
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
