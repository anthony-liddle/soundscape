import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../../test/setup'
import { installFakeAudio } from '../../test/fakeAudio'
import { SoundscapeProvider } from '../SoundscapeContext'
import { useSoundscape } from '../useSoundscape'

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
    installFakeAudio()
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
