import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTapTempo } from '../useTapTempo';

describe('useTapTempo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not call onBpm after a single tap', () => {
    const onBpm = vi.fn();
    vi.spyOn(performance, 'now').mockReturnValueOnce(0);
    const { result } = renderHook(() => useTapTempo(onBpm));
    act(() => result.current());
    expect(onBpm).not.toHaveBeenCalled();
  });

  it('calculates 120 BPM from two taps 500 ms apart', () => {
    const onBpm = vi.fn();
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(500);
    const { result } = renderHook(() => useTapTempo(onBpm));
    act(() => { result.current(); result.current(); });
    expect(onBpm).toHaveBeenCalledWith(120);
  });

  it('averages intervals across multiple taps', () => {
    const onBpm = vi.fn();
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(500)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1500);
    const { result } = renderHook(() => useTapTempo(onBpm));
    act(() => { result.current(); result.current(); result.current(); result.current(); });
    expect(onBpm).toHaveBeenLastCalledWith(120);
  });

  it('clamps BPM below 40 to 40', () => {
    const onBpm = vi.fn();
    // 3000 ms interval = 20 BPM
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(3000);
    const { result } = renderHook(() => useTapTempo(onBpm));
    act(() => { result.current(); result.current(); });
    expect(onBpm).toHaveBeenCalledWith(40);
  });

  it('clamps BPM above 200 to 200', () => {
    const onBpm = vi.fn();
    // 10 ms interval = 6000 BPM
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(10);
    const { result } = renderHook(() => useTapTempo(onBpm));
    act(() => { result.current(); result.current(); });
    expect(onBpm).toHaveBeenCalledWith(200);
  });

  it('resets tap history after 2 s of inactivity', () => {
    const onBpm = vi.fn();
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(500);
    const { result } = renderHook(() => useTapTempo(onBpm));
    act(() => { result.current(); result.current(); });

    act(() => vi.advanceTimersByTime(2100));
    onBpm.mockClear();

    // Single tap after reset — should not call onBpm
    vi.spyOn(performance, 'now').mockReturnValueOnce(3000);
    act(() => result.current());
    expect(onBpm).not.toHaveBeenCalled();
  });
});
