import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../test/setup'
import { installFakeAudio } from '../test/fakeAudio'
import App from '../App'
import twoCues from '../../../../examples/cues/peach.cues.json?raw'

/**
 * The Cues view, hidden as a public build hides it. A build is not `pnpm dev`,
 * so the flag is off unless VITE_CUES_VIEW=1. The tests stub import.meta.env
 * the same way: DEV false, and VITE_CUES_VIEW empty or 1.
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
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('confirm', vi.fn(() => true))
  // As a production build sees it
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_CUES_VIEW', '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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

const cueView = () => document.querySelector('.cue-view')
const songView = () => document.querySelector('.app-view:has(.app-transport)') as HTMLElement

describe('with the Cues view off', () => {
  it('has no Song and Cues switch in the song header', async () => {
    await renderApp()
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cues' })).toBeNull()
  })

  it('opens the song on ?view=cues, and never mounts the Cues view', async () => {
    await renderApp('/?view=cues')
    expect(songView().hidden).toBe(false)
    expect(cueView()).toBeNull()
  })

  it('keeps the keys with the song on ?view=cues, so Ctrl+S downloads the song', async () => {
    const user = await renderApp('/?view=cues')
    await user.keyboard('{Control>}s{/Control}')
    expect(downloads).toEqual(['Untitled_Soundscape.json'])
  })

  it('says plainly that a cue file is one, and that the editor cannot open it yet', async () => {
    const user = await renderApp()
    const input = document.querySelector('.import-export input[type=file]') as HTMLInputElement
    await user.upload(input, new File([twoCues], 'peach.cues.json', { type: 'application/json' }))
    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(alert).toHaveBeenCalledWith('peach.cues.json is a cue file, and this editor cannot open cue files yet.')
    expect(alert).not.toHaveBeenCalledWith('Invalid soundscape file format')
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Untitled Soundscape')).toBeInTheDocument()
    expect(cueView()).toBeNull()
  })
})

describe('with VITE_CUES_VIEW=1 in a build', () => {
  it('shows the switch, and ?view=cues opens the Cues view', async () => {
    vi.stubEnv('VITE_CUES_VIEW', '1')
    await renderApp('/?view=cues')
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument()
    expect(cueView()).not.toBeNull()
    expect(songView().hidden).toBe(true)
  })
})
