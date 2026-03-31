import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMIDIInput } from '../useMIDIInput';

const mockInput = {
  onmidimessage: null as ((e: { data: Uint8Array }) => void) | null,
  name: 'Test MIDI Keyboard',
};

const mockMIDIAccess = {
  inputs: new Map([['input-1', mockInput]]),
  onstatechange: null as (() => void) | null,
};

beforeEach(() => {
  vi.stubGlobal('navigator', {
    requestMIDIAccess: vi.fn().mockResolvedValue(mockMIDIAccess),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMIDIInput', () => {
  it('reports unsupported when requestMIDIAccess is absent', () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() =>
      useMIDIInput({ onNoteOn: vi.fn(), onNoteOff: vi.fn() })
    );
    expect(result.current.isSupported).toBe(false);
  });

  it('reports supported when requestMIDIAccess is present', () => {
    const { result } = renderHook(() =>
      useMIDIInput({ onNoteOn: vi.fn(), onNoteOff: vi.fn() })
    );
    expect(result.current.isSupported).toBe(true);
  });

  it('calls onNoteOn for a note-on message with velocity > 0', async () => {
    const onNoteOn = vi.fn();
    const { result } = renderHook(() =>
      useMIDIInput({ onNoteOn, onNoteOff: vi.fn() })
    );
    await act(() => result.current.connect());
    act(() => {
      mockInput.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) });
    });
    expect(onNoteOn).toHaveBeenCalledWith(60, 100);
  });

  it('calls onNoteOff for a note-off message', async () => {
    const onNoteOff = vi.fn();
    const { result } = renderHook(() =>
      useMIDIInput({ onNoteOn: vi.fn(), onNoteOff })
    );
    await act(() => result.current.connect());
    act(() => {
      mockInput.onmidimessage?.({ data: new Uint8Array([0x80, 60, 0]) });
    });
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('treats note-on with velocity 0 as note-off (MIDI spec)', async () => {
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    const { result } = renderHook(() => useMIDIInput({ onNoteOn, onNoteOff }));
    await act(() => result.current.connect());
    act(() => {
      mockInput.onmidimessage?.({ data: new Uint8Array([0x90, 60, 0]) });
    });
    expect(onNoteOn).not.toHaveBeenCalled();
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it('reports device names after connecting', async () => {
    const { result } = renderHook(() =>
      useMIDIInput({ onNoteOn: vi.fn(), onNoteOff: vi.fn() })
    );
    await act(() => result.current.connect());
    expect(result.current.deviceNames).toContain('Test MIDI Keyboard');
  });
});
