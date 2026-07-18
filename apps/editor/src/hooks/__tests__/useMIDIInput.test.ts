import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMIDIInput } from '../useMIDIInput'

/**
 * Web MIDI mocks: a minimal MIDIAccess with inputs, per-input onmidimessage
 * assignment, and a statechange hook for hot-plug simulation.
 */

interface FakeInput {
  name: string
  onmidimessage: ((e: { data: Uint8Array }) => void) | null
}

function makeAccess(inputNames: string[]) {
  const inputs = new Map<string, FakeInput>(
    inputNames.map((name, i) => [`in-${i}`, { name, onmidimessage: null }])
  )
  const access = {
    inputs,
    onstatechange: null as (() => void) | null,
  }
  return access
}

function send(access: ReturnType<typeof makeAccess>, bytes: number[]) {
  for (const input of access.inputs.values()) {
    input.onmidimessage?.({ data: new Uint8Array(bytes) })
  }
}

describe('useMIDIInput', () => {
  let access: ReturnType<typeof makeAccess>
  let onNoteOn: ReturnType<typeof vi.fn>
  let onNoteOff: ReturnType<typeof vi.fn>

  beforeEach(() => {
    access = makeAccess(['Fake Keys 61'])
    onNoteOn = vi.fn()
    onNoteOff = vi.fn()
    vi.stubGlobal('navigator', {
      ...navigator,
      requestMIDIAccess: vi.fn().mockResolvedValue(access),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function render(props?: Partial<{ onNoteOn: typeof onNoteOn; onNoteOff: typeof onNoteOff }>) {
    return renderHook(
      ({ on, off }: { on: typeof onNoteOn; off: typeof onNoteOff }) =>
        useMIDIInput({ onNoteOn: on, onNoteOff: off }),
      { initialProps: { on: props?.onNoteOn ?? onNoteOn, off: props?.onNoteOff ?? onNoteOff } }
    )
  }

  it('reports unsupported when the browser lacks Web MIDI', () => {
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: undefined })
    const { result } = render()
    expect(result.current.isSupported).toBe(false)
    expect(result.current.isConnected).toBe(false)
  })

  it('connects on demand and lists device names', async () => {
    const { result } = render()
    expect(result.current.isSupported).toBe(true)
    expect(result.current.isConnected).toBe(false)

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.isConnected).toBe(true)
    expect(result.current.deviceNames).toEqual(['Fake Keys 61'])
  })

  it('reports an error when access is denied', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      requestMIDIAccess: vi.fn().mockRejectedValue(new Error('denied')),
    })
    const { result } = render()

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.isConnected).toBe(false)
    expect(result.current.error).toContain('denied')
  })

  describe('message parsing (after connect)', () => {
    it('dispatches note-on with pitch and velocity', async () => {
      const { result } = render()
      await act(async () => result.current.connect())

      act(() => send(access, [0x90, 60, 100]))
      expect(onNoteOn).toHaveBeenCalledExactlyOnceWith(60, 100)
      expect(onNoteOff).not.toHaveBeenCalled()
    })

    it('treats note-on with velocity 0 as note-off', async () => {
      const { result } = render()
      await act(async () => result.current.connect())

      act(() => send(access, [0x90, 60, 0]))
      expect(onNoteOff).toHaveBeenCalledExactlyOnceWith(60)
      expect(onNoteOn).not.toHaveBeenCalled()
    })

    it('dispatches explicit note-off (0x80)', async () => {
      const { result } = render()
      await act(async () => result.current.connect())

      act(() => send(access, [0x80, 64, 64]))
      expect(onNoteOff).toHaveBeenCalledExactlyOnceWith(64)
    })

    it('parses note messages on any channel', async () => {
      const { result } = render()
      await act(async () => result.current.connect())

      act(() => send(access, [0x93, 72, 90])) // note-on, channel 4
      expect(onNoteOn).toHaveBeenCalledExactlyOnceWith(72, 90)
    })

    it('ignores non-note messages (CC, pitch bend, clock)', async () => {
      const { result } = render()
      await act(async () => result.current.connect())

      act(() => {
        send(access, [0xb0, 1, 64]) // CC
        send(access, [0xe0, 0, 64]) // pitch bend
        send(access, [0xf8]) // clock
      })
      expect(onNoteOn).not.toHaveBeenCalled()
      expect(onNoteOff).not.toHaveBeenCalled()
    })

    it('uses the LATEST callbacks after a re-render (no stale closures)', async () => {
      const { result, rerender } = render()
      await act(async () => result.current.connect())

      const newOnNoteOn = vi.fn()
      rerender({ on: newOnNoteOn, off: onNoteOff })

      act(() => send(access, [0x90, 60, 100]))
      expect(newOnNoteOn).toHaveBeenCalledExactlyOnceWith(60, 100)
      expect(onNoteOn).not.toHaveBeenCalled()
    })
  })

  it('updates the device list on hot-plug (statechange)', async () => {
    const { result } = render()
    await act(async () => result.current.connect())
    expect(result.current.deviceNames).toEqual(['Fake Keys 61'])

    access.inputs.set('in-9', { name: 'New Synth', onmidimessage: null })
    act(() => access.onstatechange?.())

    await waitFor(() => {
      expect(result.current.deviceNames).toEqual(['Fake Keys 61', 'New Synth'])
    })

    // The new device's messages are heard too
    act(() => send(access, [0x90, 48, 80]))
    expect(onNoteOn).toHaveBeenCalledWith(48, 80)
  })
})
