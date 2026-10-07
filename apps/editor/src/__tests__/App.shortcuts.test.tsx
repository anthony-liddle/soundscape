import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../test/setup'
import { installFakeAudio } from '../test/fakeAudio'
import App from '../App'

/**
 * The song editor's keyboard shortcuts, pressed in the real app on the real
 * engine, with only Web Audio and the file download stood in for.
 */

let downloads: { name: string; blob: Blob }[]

beforeEach(() => {
  resetMockUuid()
  installFakeAudio()
  // jsdom draws nothing; the visualizer copes with no context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  // Export saves through a blob link; keep what it would have saved
  downloads = []
  let lastBlob: Blob | null = null
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      lastBlob = blob
      return 'blob:soundscape'
    },
    revokeObjectURL: () => {},
  }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (lastBlob) downloads.push({ name: this.download, blob: lastBlob })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function renderApp() {
  const user = userEvent.setup()
  render(<App />)
  // Let the engine's initialize() settle
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return user
}

const isPlaying = () => screen.getByRole('button', { name: /^(Play|Stop)$/ }).textContent === 'Stop'
const trackCount = () => document.querySelectorAll('.track-item').length
const settle = () => act(async () => {})

/** Add a track with the mouse, then put focus back on the page. */
async function addTrack(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Add Track' }))
  ;(document.activeElement as HTMLElement).blur()
}

describe('song editor shortcuts, with focus on the page', () => {
  it('Space starts the song, and Space again stops it', async () => {
    const user = await renderApp()
    await user.keyboard(' ')
    await waitFor(() => expect(isPlaying()).toBe(true))
    await user.keyboard(' ')
    await waitFor(() => expect(isPlaying()).toBe(false))
  })

  it('Space starts the song with Shift held', async () => {
    const user = await renderApp()
    await user.keyboard('{Shift>} {/Shift}')
    await waitFor(() => expect(isPlaying()).toBe(true))
  })

  it('Ctrl+Z undoes, and Ctrl+Shift+Z redoes', async () => {
    const user = await renderApp()
    await addTrack(user)
    expect(trackCount()).toBe(2)
    await user.keyboard('{Control>}z{/Control}')
    expect(trackCount()).toBe(1)
    await user.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}')
    expect(trackCount()).toBe(2)
  })

  it('Cmd+Z undoes, as Ctrl+Z does', async () => {
    const user = await renderApp()
    await addTrack(user)
    await user.keyboard('{Meta>}z{/Meta}')
    expect(trackCount()).toBe(1)
  })

  it('Ctrl+Y redoes, as Ctrl+Shift+Z does', async () => {
    const user = await renderApp()
    await addTrack(user)
    await user.keyboard('{Control>}z{/Control}')
    await user.keyboard('{Control>}y{/Control}')
    expect(trackCount()).toBe(2)
  })

  it('Ctrl+Z is claimed from the browser even with nothing to undo', async () => {
    await renderApp()
    const notPrevented = fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(notPrevented).toBe(false)
  })

  it('follows the physical key, so Ctrl+Z on a QWERTZ layout still undoes', async () => {
    const user = await renderApp()
    await addTrack(user)
    // On QWERTZ the key in Z's place types "y"
    fireEvent.keyDown(document.body, { key: 'y', code: 'KeyZ', ctrlKey: true })
    expect(trackCount()).toBe(1)
  })

  it('Ctrl+S downloads the song', async () => {
    const user = await renderApp()
    await user.keyboard('{Control>}s{/Control}')
    expect(downloads.map((d) => d.name)).toEqual(['Untitled_Soundscape.json'])
    const saved = JSON.parse(await downloads[0]!.blob.text())
    expect(Object.keys(saved)).toEqual(['metadata', 'tracks', 'mixer'])
    expect(saved.tracks).toHaveLength(1)
  })

  it('Ctrl+D duplicates the selected track', async () => {
    const user = await renderApp()
    await user.keyboard('{Control>}d{/Control}')
    expect(trackCount()).toBe(2)
    expect(screen.getByDisplayValue('Track 1 - copy')).toBeInTheDocument()
  })

  it('leaves other keys to the page', async () => {
    await renderApp()
    expect(fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA', ctrlKey: true })).toBe(true)
    await settle()
    expect(isPlaying()).toBe(false)
  })
})
