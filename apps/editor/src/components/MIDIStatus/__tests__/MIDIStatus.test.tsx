import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Track } from 'soundscape-engine';
import { MIDIStatus, RECORD_GRID } from '../MIDIStatus';

/**
 * MIDIStatus drives recording through the Soundscape context and Web MIDI.
 * Both are mocked so the test can drive note events and transport state
 * directly, and assert on what the component commits.
 */

interface FakeInput {
  name: string;
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}

const access = {
  inputs: new Map<string, FakeInput>([
    ['in-0', { name: 'Fake Keys 61', onmidimessage: null }],
  ]),
  onstatechange: null as (() => void) | null,
};

function sendMIDI(bytes: number[]) {
  for (const input of access.inputs.values()) {
    input.onmidimessage?.({ data: new Uint8Array(bytes) });
  }
}

const dispatch = vi.fn();
let isPlaying = false;
let currentBeat = 0;

vi.mock('../../../state', () => ({
  useSoundscape: () => ({
    state: { metadata: { lengthBeats: 16 } },
    dispatch,
    playback: { isPlaying },
    startNote: vi.fn(),
    stopNote: vi.fn(),
    getCurrentBeat: () => currentBeat,
  }),
}));

const track: Track = {
  id: 'track-1',
  name: 'Lead',
  presetId: 'preset-piano',
  notes: [],
};

describe('MIDIStatus recording', () => {
  beforeEach(() => {
    dispatch.mockClear();
    isPlaying = false;
    currentBeat = 0;
    for (const input of access.inputs.values()) input.onmidimessage = null;
    vi.stubGlobal('navigator', {
      ...navigator,
      requestMIDIAccess: vi.fn().mockResolvedValue(access),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function connectAndArm(onRecordingGrid?: (grid: number) => void) {
    const user = userEvent.setup();
    const view = render(
      <MIDIStatus track={track} onRecordingGrid={onRecordingGrid} />
    );
    await user.click(screen.getByRole('button', { name: /connect midi/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /record/i })).toBeTruthy()
    );
    await user.click(screen.getByRole('button', { name: /record/i }));
    return view;
  }

  it('notifies the recording grid as soon as recording starts', async () => {
    const onRecordingGrid = vi.fn();
    const view = await connectAndArm(onRecordingGrid);
    expect(onRecordingGrid).not.toHaveBeenCalled();

    isPlaying = true;
    view.rerender(
      <MIDIStatus track={track} onRecordingGrid={onRecordingGrid} />
    );

    // Before a single note is played, the editor is asked to match the grid
    expect(onRecordingGrid).toHaveBeenCalledWith(RECORD_GRID);
  });

  it('notifies the recording grid once a take is committed', async () => {
    const onRecordingGrid = vi.fn();
    const view = await connectAndArm(onRecordingGrid);

    // Transport starts: the recorder opens
    isPlaying = true;
    view.rerender(
      <MIDIStatus track={track} onRecordingGrid={onRecordingGrid} />
    );
    onRecordingGrid.mockClear();

    // Play one note across a quarter beat
    currentBeat = 1;
    act(() => sendMIDI([0x90, 60, 100]));
    currentBeat = 2;
    act(() => sendMIDI([0x80, 60, 0]));

    // Transport stops: the take commits
    isPlaying = false;
    view.rerender(
      <MIDIStatus track={track} onRecordingGrid={onRecordingGrid} />
    );

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_NOTES' })
    );
    expect(onRecordingGrid).toHaveBeenCalledWith(RECORD_GRID);
  });

  it('commits nothing when a take recorded no notes', async () => {
    const onRecordingGrid = vi.fn();
    const view = await connectAndArm(onRecordingGrid);

    isPlaying = true;
    view.rerender(
      <MIDIStatus track={track} onRecordingGrid={onRecordingGrid} />
    );
    onRecordingGrid.mockClear();
    isPlaying = false;
    view.rerender(
      <MIDIStatus track={track} onRecordingGrid={onRecordingGrid} />
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(onRecordingGrid).not.toHaveBeenCalled();
  });
});
