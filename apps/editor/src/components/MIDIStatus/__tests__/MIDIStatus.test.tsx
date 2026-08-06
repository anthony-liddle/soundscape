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

  it('publishes an in-progress preview without dispatching', async () => {
    const onPreviewChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MIDIStatus track={track} onPreviewChange={onPreviewChange} />
    );
    await user.click(screen.getByRole('button', { name: /connect midi/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /record/i })).toBeTruthy()
    );
    await user.click(screen.getByRole('button', { name: /record/i }));

    isPlaying = true;
    view.rerender(
      <MIDIStatus track={track} onPreviewChange={onPreviewChange} />
    );

    // A held note shows up before it is released
    currentBeat = 1;
    act(() => sendMIDI([0x90, 60, 100]));
    currentBeat = 2;
    act(() => sendMIDI([0x80, 60, 0]));

    expect(onPreviewChange).toHaveBeenLastCalledWith({
      trackId: 'track-1',
      notes: [{ pitch: 60, startTime: 1, duration: 1, velocity: 100 }],
    });
    // Preview is display-only — nothing reaches the reducer mid-take
    expect(dispatch).not.toHaveBeenCalled();

    // Committing clears it
    isPlaying = false;
    view.rerender(
      <MIDIStatus track={track} onPreviewChange={onPreviewChange} />
    );
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_NOTES' })
    );
  });

  it('commits the take to the track that was selected when recording started', async () => {
    const onPreviewChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MIDIStatus track={track} onPreviewChange={onPreviewChange} />
    );
    await user.click(screen.getByRole('button', { name: /connect midi/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /record/i })).toBeTruthy()
    );
    await user.click(screen.getByRole('button', { name: /record/i }));

    isPlaying = true;
    view.rerender(
      <MIDIStatus track={track} onPreviewChange={onPreviewChange} />
    );

    currentBeat = 1;
    act(() => sendMIDI([0x90, 60, 100]));
    currentBeat = 2;
    act(() => sendMIDI([0x80, 60, 0]));

    // The user selects a different track mid-take
    const otherTrack: Track = { ...track, id: 'track-2', name: 'Bass' };
    view.rerender(
      <MIDIStatus track={otherTrack} onPreviewChange={onPreviewChange} />
    );

    // The take stays with the track it was recorded against
    expect(onPreviewChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ trackId: 'track-1' })
    );

    isPlaying = false;
    view.rerender(
      <MIDIStatus track={otherTrack} onPreviewChange={onPreviewChange} />
    );

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ADD_NOTES',
        payload: expect.objectContaining({ trackId: 'track-1' }),
      })
    );
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
