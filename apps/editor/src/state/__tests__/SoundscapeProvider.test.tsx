import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../../test/setup'
import { SoundscapeProvider } from '../SoundscapeContext'
import { useSoundscape } from '../useSoundscape'

// Minimal Web Audio stubs — jsdom has no AudioContext. The engine only needs
// the node graph methods it calls during initialize/updateState.
function makeNode() {
  const param = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  }
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: param,
    frequency: param,
    detune: param,
    Q: param,
    threshold: param,
    knee: param,
    ratio: param,
    attack: param,
    release: param,
    delayTime: param,
    curve: null,
    oversample: '',
    buffer: null,
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 1024,
    start: vi.fn(),
    stop: vi.fn(),
    port: { onmessage: null, postMessage: vi.fn() },
  }
}

class FakeAudioContext {
  currentTime = 0
  sampleRate = 44100
  state = 'running'
  destination = makeNode()
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
  createGain = vi.fn(() => makeNode())
  createDynamicsCompressor = vi.fn(() => makeNode())
  createAnalyser = vi.fn(() => makeNode())
  createBiquadFilter = vi.fn(() => makeNode())
  createOscillator = vi.fn(() => makeNode())
  createDelay = vi.fn(() => makeNode())
  createWaveShaper = vi.fn(() => makeNode())
  createConvolver = vi.fn(() => makeNode())
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(8) }))
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}

function Harness() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useSoundscape()
  return (
    <div>
      <span data-testid="track-count">{state.tracks.length}</span>
      <span data-testid="can-undo">{String(canUndo)}</span>
      <span data-testid="can-redo">{String(canRedo)}</span>
      <button onClick={() => dispatch({ type: 'ADD_TRACK', payload: { name: 'T', presetId: 'lead' } })}>
        add
      </button>
      <button onClick={() => dispatch({ type: 'SET_MASTER_VOLUME', payload: Math.random() })}>
        volume
      </button>
      <button onClick={undo}>undo</button>
      <button onClick={redo}>redo</button>
    </div>
  )
}

function renderApp() {
  return render(
    <StrictMode>
      <SoundscapeProvider>
        <Harness />
      </SoundscapeProvider>
    </StrictMode>
  )
}

describe('SoundscapeProvider integration (StrictMode)', () => {
  beforeEach(() => {
    resetMockUuid()
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null }; connect() {}; disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  })

  it('mounts and unmounts under StrictMode without unhandled errors', async () => {
    const { unmount } = renderApp()
    // Let the double-mounted effect's initialize() promises settle — the
    // cancelled-flag guard must prevent updateState on the destroyed engine
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByTestId('track-count').textContent).toBe('1')
    unmount()
  })

  it('undo/redo round-trips a discrete edit exactly once despite StrictMode double-invocation', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('add'))
    expect(screen.getByTestId('track-count').textContent).toBe('2')
    expect(screen.getByTestId('can-undo').textContent).toBe('true')

    await user.click(screen.getByText('undo'))
    expect(screen.getByTestId('track-count').textContent).toBe('1')
    expect(screen.getByTestId('can-undo').textContent).toBe('false')
    expect(screen.getByTestId('can-redo').textContent).toBe('true')

    await user.click(screen.getByText('redo'))
    expect(screen.getByTestId('track-count').textContent).toBe('2')
    expect(screen.getByTestId('can-redo').textContent).toBe('false')

    // A second undo+undo must not over-rewind (duplicate history entries
    // were the StrictMode bug in the old setState-based implementation)
    await user.click(screen.getByText('undo'))
    expect(screen.getByTestId('track-count').textContent).toBe('1')
    expect(screen.getByTestId('can-undo').textContent).toBe('false')
  })

  it('coalesces a volume drag into a single undo entry', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByText('volume'))
    await user.click(screen.getByText('volume'))
    await user.click(screen.getByText('volume'))
    expect(screen.getByTestId('can-undo').textContent).toBe('true')

    await user.click(screen.getByText('undo'))
    // All three volume changes undone in one step
    expect(screen.getByTestId('can-undo').textContent).toBe('false')
  })
})
