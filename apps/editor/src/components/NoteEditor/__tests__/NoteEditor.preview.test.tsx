import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Track } from 'soundscape-engine';
import { NoteEditor } from '../NoteEditor';

/**
 * Covers how an in-progress MIDI take is drawn: which cells get the preview
 * class, and that preview notes stay inert relative to committed notes.
 */

vi.mock('../../../state', () => ({
  useSoundscape: () => ({
    state: { metadata: { lengthBeats: 4 } },
    dispatch: vi.fn(),
    previewNote: vi.fn(),
    playback: { isPlaying: false, currentBeat: 0 },
  }),
}));

const track: Track = {
  id: 'track-1',
  name: 'Lead',
  presetId: 'preset-piano',
  notes: [],
};

function renderEditor(
  previewNotes: { pitch: number; startTime: number; duration: number; velocity: number }[],
  trackNotes: Track['notes'] = []
) {
  return render(
    <NoteEditor
      track={{ ...track, notes: trackNotes }}
      subdivision={0.25}
      onSubdivisionChange={vi.fn()}
      previewNotes={previewNotes}
    />
  );
}

describe('NoteEditor preview notes', () => {
  it('marks exactly the cells a preview note spans', () => {
    // One beat at 1/16 resolution spans 4 cells
    const { container } = renderEditor([
      { pitch: 60, startTime: 1, duration: 1, velocity: 100 },
    ]);
    expect(container.querySelectorAll('.note-preview')).toHaveLength(4);
  });

  it('marks a single cell for a minimum-length note', () => {
    const { container } = renderEditor([
      { pitch: 60, startTime: 0, duration: 0.25, velocity: 100 },
    ]);
    expect(container.querySelectorAll('.note-preview')).toHaveLength(1);
  });

  it('draws nothing when there is no take in progress', () => {
    const { container } = renderEditor([]);
    expect(container.querySelectorAll('.note-preview')).toHaveLength(0);
  });

  it('lets a committed note win over an overlapping preview cell', () => {
    const { container } = renderEditor(
      [{ pitch: 60, startTime: 0, duration: 0.5, velocity: 100 }],
      [{ id: 'n1', pitch: 60, startTime: 0, duration: 0.25, velocity: 90 }]
    );
    // The first cell belongs to the committed note; only the second previews
    expect(container.querySelectorAll('.note-preview')).toHaveLength(1);
    expect(container.querySelectorAll('.has-note')).toHaveLength(1);
  });

  it('keeps preview cells out of selection', () => {
    const { container } = renderEditor([
      { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
    ]);
    expect(container.querySelectorAll('.note-preview.selected')).toHaveLength(0);
  });
});
