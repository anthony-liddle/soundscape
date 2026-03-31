import type { SoundscapeState } from 'soundscape-engine';

type ExportState = Omit<SoundscapeState, 'presets'>;

export function exportSoundscape(state: SoundscapeState): void {
  const exportData: ExportState = {
    metadata: state.metadata,
    tracks: state.tracks,
    patterns: state.patterns,
    arrangement: state.arrangement,
    mixer: state.mixer,
  };
  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.metadata.name.replace(/\s+/g, '_')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
