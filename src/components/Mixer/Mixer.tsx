import { useSoundscape } from '../../state';
import { Button, Slider } from '../common';
import { defaultTrackMixerState } from '../../types';
import './Mixer.css';

interface MixerProps {
  selectedTrackId: string | null;
}

export function Mixer({ selectedTrackId }: MixerProps) {
  const { state, dispatch } = useSoundscape();

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

  const handleMasterVolumeChange = (volume: number) => {
    dispatch({ type: 'SET_MASTER_VOLUME', payload: volume });
  };

  return (
    <div className="mixer">
      <h3>Mixer</h3>

      <div className="mixer-channels">
        {state.tracks.map((track) => {
          const mixerState = state.mixer.tracks[track.id] || defaultTrackMixerState;
          const isSelected = track.id === selectedTrackId;
          return (
            <div key={track.id} className={`mixer-channel ${isSelected ? 'mixer-channel-selected' : ''}`}>
              <div className="mixer-channel-name">{track.name}</div>

              <div className="mixer-fader">
                <Slider
                  value={mixerState.volume}
                  min={0}
                  max={1}
                  step={0.01}
                  vertical
                  showValue={false}
                  onChange={(v) => handleVolumeChange(track.id, v)}
                />
              </div>

              <div className="mixer-channel-value">
                {Math.round(mixerState.volume * 100)}%
              </div>

              <div className="mixer-channel-buttons">
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
            </div>
          );
        })}

        <div className="mixer-channel mixer-master">
          <div className="mixer-channel-name">Master</div>

          <div className="mixer-fader">
            <Slider
              value={state.mixer.masterVolume}
              min={0}
              max={1}
              step={0.01}
              vertical
              showValue={false}
              onChange={handleMasterVolumeChange}
            />
          </div>

          <div className="mixer-channel-value">
            {Math.round(state.mixer.masterVolume * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
