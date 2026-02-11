import { useSoundscape } from '../../state';
import { Button, Slider } from '../common';
import './Transport.css';

export function Transport() {
  const { state, dispatch, playback, play, stop, setTempo, setLoop } = useSoundscape();

  const handleMasterVolumeChange = (volume: number) => {
    dispatch({ type: 'SET_MASTER_VOLUME', payload: volume });
  };

  const handlePlayStop = () => {
    if (playback.isPlaying) {
      stop();
    } else {
      play();
    }
  };

  return (
    <div className="transport">
      <div className="transport-controls">
        <Button
          variant={playback.isPlaying ? 'danger' : 'primary'}
          onClick={handlePlayStop}
          size="large"
        >
          {playback.isPlaying ? 'Stop' : 'Play'}
        </Button>

        <Button
          variant="secondary"
          active={playback.loop}
          onClick={() => setLoop(!playback.loop)}
        >
          Loop
        </Button>
      </div>

      <div className="transport-display">
        <div className="transport-beat">
          {Math.floor(playback.currentBeat) + 1}
        </div>
        <div className="transport-info">
          / {state.metadata.lengthBeats}
        </div>
      </div>

      <div className="transport-tempo">
        <Slider
          value={state.metadata.tempo}
          min={40}
          max={200}
          step={1}
          label="BPM"
          formatValue={(v) => v.toFixed(0)}
          onChange={setTempo}
        />
      </div>

      <div className="transport-master-volume">
        <Slider
          value={state.mixer.masterVolume}
          min={0}
          max={1}
          step={0.01}
          label="Master"
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={handleMasterVolumeChange}
        />
      </div>
    </div>
  );
}
