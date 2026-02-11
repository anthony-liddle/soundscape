import { useSoundscape } from '../../state';
import { Button, Select, Slider } from '../common';
import { defaultTrackMixerState } from '../../types';
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

  const handleDuplicateTrack = (trackId: string) => {
    dispatch({ type: 'DUPLICATE_TRACK', payload: { trackId } });
  };

  const handleVolumeChange = (trackId: string, volume: number) => {
    dispatch({
      type: 'SET_MIXER_TRACK',
      payload: { trackId, state: { volume } },
    });
  };

  const handleMuteToggle = (trackId: string) => {
    const current = state.mixer.tracks[trackId] || defaultTrackMixerState;
    dispatch({
      type: 'SET_MIXER_TRACK',
      payload: { trackId, state: { mute: !current.mute } },
    });
  };

  const handleSoloToggle = (trackId: string) => {
    const current = state.mixer.tracks[trackId] || defaultTrackMixerState;
    dispatch({
      type: 'SET_MIXER_TRACK',
      payload: { trackId, state: { solo: !current.solo } },
    });
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
            <div className="track-item-header">
              <input
                type="text"
                className="track-item-name-input"
                value={track.name}
                onChange={(e) => handleTrackNameChange(track.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="track-item-actions">
                <Button
                  size="small"
                  onClick={() => handleDuplicateTrack(track.id)}
                >
                  Copy
                </Button>
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

            <div className="track-item-body">
              <span className="track-item-notes">{track.notes.length} notes</span>
              <Select
                value={track.presetId}
                options={presetOptions}
                onChange={(presetId) => handlePresetChange(track.id, presetId)}
              />
            </div>

            <div className="track-item-volume">
              {(() => {
                const mixerState = state.mixer.tracks[track.id] || defaultTrackMixerState;
                return (
                  <>
                    <div className="track-item-volume-buttons">
                      <Button
                        size="small"
                        variant={mixerState.mute ? 'danger' : 'secondary'}
                        onClick={() => handleMuteToggle(track.id)}
                      >
                        M
                      </Button>
                      <Button
                        size="small"
                        variant={mixerState.solo ? 'primary' : 'secondary'}
                        onClick={() => handleSoloToggle(track.id)}
                      >
                        S
                      </Button>
                    </div>
                    <div className="track-item-volume-slider">
                      <Slider
                        value={mixerState.volume}
                        min={0}
                        max={1}
                        step={0.01}
                        showValue={false}
                        onChange={(v) => handleVolumeChange(track.id, v)}
                      />
                    </div>
                    <span className="track-item-volume-value">
                      {Math.round(mixerState.volume * 100)}%
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
