import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../test/setup'
import { installFakeAudio } from '../test/fakeAudio'
import App from '../App'

/**
 * The song and cue views in the real app: which is in front, what the address
 * says, what survives a switch, and that the song's keys stay with the song.
 */

let downloads: string[]

beforeEach(() => {
  resetMockUuid()
  installFakeAudio()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  downloads = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:soundscape', revokeObjectURL: () => {} }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

async function renderApp(address = '/') {
  window.history.replaceState(null, '', address)
  const user = userEvent.setup()
  render(<App />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return user
}

type User = Awaited<ReturnType<typeof renderApp>>

const songView = () => document.querySelector('.app-view:has(.app-transport)') as HTMLElement
const cueView = () => document.querySelector('.app-view:has(.cue-view)') as HTMLElement | null
// Read from the DOM, since a hidden view is out of the accessibility tree
const isPlaying = () => document.querySelector('.transport-controls button')!.textContent === 'Stop'
const trackCount = () => document.querySelectorAll('.track-item').length
// Notes in the song's first track, as its track list entry counts them
const noteCount = () => parseInt(document.querySelector('.track-item-notes')!.textContent!, 10)
const settle = () => act(async () => {})
const blur = () => (document.activeElement as HTMLElement | null)?.blur()

async function switchTo(user: User, name: 'Song' | 'Cues') {
  const visible = [songView(), cueView()].find((v) => v && !v.hidden)!
  const button = [...visible.querySelectorAll('button')].find((b) => b.textContent === name)!
  await user.click(button)
  blur()
}

/** Draw one note in the piano roll, switch to the select tool and select it. */
async function selectOneNote(user: User) {
  const cell = document.querySelector('.note-editor-cell')!
  fireEvent.mouseDown(cell)
  fireEvent.mouseUp(cell)
  await user.click(screen.getByRole('button', { name: 'Select' }))
  blur()
  await user.keyboard('{Control>}a{/Control}')
  expect(document.querySelectorAll('.note-editor-cell.selected')).toHaveLength(1)
}

describe('the view switch', () => {
  it('opens on the song, marked as the current view', async () => {
    await renderApp()
    expect(screen.getByRole('button', { name: 'Song' })).toHaveAttribute('aria-current', 'page')
    expect(cueView()).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('shows the cues, and writes ?view=cues into the address', async () => {
    const user = await renderApp()
    await switchTo(user, 'Cues')
    expect(window.location.search).toBe('?view=cues')
    expect(songView().hidden).toBe(true)
    expect(cueView()!.hidden).toBe(false)
    expect(screen.getByRole('button', { name: 'Cues' })).toHaveAttribute('aria-current', 'page')
  })

  it('comes back to the cues on a reload of ?view=cues, keeping other parameters', async () => {
    await renderApp('/soundscape/?view=cues&debug=1')
    expect(cueView()!.hidden).toBe(false)
    expect(songView().hidden).toBe(true)
    expect(new URLSearchParams(window.location.search).get('debug')).toBe('1')
  })

  it('goes back to the song, and takes ?view= out of the address', async () => {
    const user = await renderApp('/?view=cues')
    await switchTo(user, 'Song')
    expect(window.location.search).toBe('')
    expect(songView().hidden).toBe(false)
    expect(cueView()!.hidden).toBe(true)
  })

  it('has no em dash in the header', async () => {
    await renderApp()
    expect(songView().querySelector('header')!.textContent).not.toContain('\u2014')
  })
})

describe('the song, after a visit to the cues', () => {
  it('keeps its selected track and its piano roll resolution', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: '+ Add Track' }))
    const second = document.querySelectorAll('.track-item')[1] as HTMLElement
    await user.click(second)
    await user.click(screen.getByRole('button', { name: '1/16' }))
    blur()
    await switchTo(user, 'Cues')
    await switchTo(user, 'Song')
    expect(document.querySelectorAll('.track-item')[1]).toHaveClass('track-item-selected')
    expect(screen.getByRole('button', { name: '1/16' })).toHaveClass('active')
    expect(trackCount()).toBe(2)
  })

  it('keeps a MIDI take in progress on the piano roll', async () => {
    const input = { name: 'Fake Keys', onmidimessage: null as ((e: { data: Uint8Array }) => void) | null }
    vi.stubGlobal('navigator', {
      ...navigator,
      requestMIDIAccess: vi.fn().mockResolvedValue({ inputs: new Map([['in-0', input]]), onstatechange: null }),
    })
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Connect MIDI' }))
    await user.click(await screen.findByRole('button', { name: 'Record' }))
    blur()
    await user.keyboard(' ')
    await waitFor(() => expect(isPlaying()).toBe(true))
    act(() => input.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) }))
    await waitFor(() => expect(document.querySelectorAll('.note-preview').length).toBeGreaterThan(0))
    const previewCells = document.querySelectorAll('.note-preview').length

    await switchTo(user, 'Cues')
    await switchTo(user, 'Song')
    expect(document.querySelectorAll('.note-preview')).toHaveLength(previewCells)
  })
})

describe('with the cues in front', () => {
  it('Space does not play the song', async () => {
    const user = await renderApp()
    await switchTo(user, 'Cues')
    await user.keyboard(' ')
    await settle()
    expect(isPlaying()).toBe(false)
  })

  it('Ctrl+Z and Ctrl+Shift+Z leave the song history alone', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: '+ Add Track' }))
    blur()
    await switchTo(user, 'Cues')
    await user.keyboard('{Control>}z{/Control}')
    expect(trackCount()).toBe(2)
    await switchTo(user, 'Song')
    await user.keyboard('{Control>}z{/Control}')
    expect(trackCount()).toBe(1)
    await switchTo(user, 'Cues')
    await user.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}')
    expect(trackCount()).toBe(1)
  })

  it('Ctrl+S does not download the song', async () => {
    const user = await renderApp()
    await switchTo(user, 'Cues')
    await user.keyboard('{Control>}s{/Control}')
    expect(downloads).toEqual([])
  })

  it('Ctrl+D does not duplicate a song track', async () => {
    const user = await renderApp()
    await switchTo(user, 'Cues')
    await user.keyboard('{Control>}d{/Control}')
    expect(trackCount()).toBe(1)
  })
})

describe("the piano roll's keys, with the cues in front", () => {
  it('Delete and Backspace leave the selected song notes alone', async () => {
    const user = await renderApp()
    await selectOneNote(user)
    await switchTo(user, 'Cues')
    await user.keyboard('{Delete}{Backspace}')
    await switchTo(user, 'Song')
    expect(noteCount()).toBe(1)
    // The selection itself survived, and Delete still works on the song
    await user.keyboard('{Delete}')
    expect(noteCount()).toBe(0)
  })

  it('Ctrl+C and Ctrl+V do not paste into the song', async () => {
    const user = await renderApp()
    await selectOneNote(user)
    await user.keyboard('{Control>}c{/Control}')
    await switchTo(user, 'Cues')
    await user.keyboard('{Control>}v{/Control}')
    await switchTo(user, 'Song')
    expect(noteCount()).toBe(1)
  })

  it('Ctrl+A does not select song notes', async () => {
    const user = await renderApp()
    const cell = document.querySelector('.note-editor-cell')!
    fireEvent.mouseDown(cell)
    fireEvent.mouseUp(cell)
    await user.click(screen.getByRole('button', { name: 'Select' }))
    blur()
    await switchTo(user, 'Cues')
    await user.keyboard('{Control>}a{/Control}')
    await switchTo(user, 'Song')
    expect(document.querySelectorAll('.note-editor-cell.selected')).toHaveLength(0)
  })
})
