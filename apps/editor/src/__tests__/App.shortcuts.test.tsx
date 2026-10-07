import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react'
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
  for (const el of extras.splice(0)) el.remove()
  for (const stop of watchers.splice(0)) stop()
})

const extras: HTMLElement[] = []
const watchers: (() => void)[] = []

/** Put a control on the page outside the app, as a later view or widget would. */
function addToPage<T extends HTMLElement>(el: T): T {
  document.body.append(el)
  extras.push(el)
  return el
}

function element(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value)
  return el
}

/** Whether the last keydown reached the page with its default prevented. */
function watchDefault() {
  let prevented: boolean | null = null
  const listener = (e: KeyboardEvent) => {
    prevented = e.defaultPrevented
  }
  // Added after the app's own listener, so it sees what the app did
  window.addEventListener('keydown', listener)
  watchers.push(() => window.removeEventListener('keydown', listener))
  return () => prevented
}

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

describe('Space on a focused control', () => {
  it('presses a focused button instead of playing the song', async () => {
    const user = await renderApp()
    const prevented = watchDefault()
    const loop = screen.getByRole('button', { name: 'Loop' })
    expect(loop).toHaveClass('btn-active')
    loop.focus()
    await user.keyboard(' ')
    await settle()
    expect(loop).not.toHaveClass('btn-active')
    expect(isPlaying()).toBe(false)
    expect(prevented()).toBe(false)
  })

  it('leaves Space to a focused select instead of playing the song', async () => {
    const user = await renderApp()
    const prevented = watchDefault()
    const panel = document.querySelector<HTMLElement>('.instrument-panel')!
    within(panel).getAllByRole('combobox')[0]!.focus()
    await user.keyboard(' ')
    await settle()
    expect(isPlaying()).toBe(false)
    expect(prevented()).toBe(false)
  })

  it.each([
    ['a summary', () => element('summary', { tabindex: '0' })],
    ['role="button"', () => element('div', { role: 'button', tabindex: '0' })],
    ['role="checkbox"', () => element('div', { role: 'checkbox', tabindex: '0' })],
    ['role="radio"', () => element('div', { role: 'radio', tabindex: '0' })],
    ['role="switch"', () => element('div', { role: 'switch', tabindex: '0' })],
    ['role="tab"', () => element('div', { role: 'tab', tabindex: '0' })],
    ['role="menuitem"', () => element('div', { role: 'menuitem', tabindex: '0' })],
    ['role="option"', () => element('div', { role: 'option', tabindex: '0' })],
  ])('leaves Space to %s instead of playing the song', async (_name, make) => {
    const user = await renderApp()
    const prevented = watchDefault()
    addToPage(make()).focus()
    await user.keyboard(' ')
    await settle()
    expect(isPlaying()).toBe(false)
    expect(prevented()).toBe(false)
  })

  it('leaves Space to a widget that handles it itself', async () => {
    const user = await renderApp()
    const widget = addToPage(element('div', { tabindex: '0' }))
    let handled = 0
    widget.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handled++
      }
    })
    widget.focus()
    await user.keyboard(' ')
    await settle()
    expect(handled).toBe(1)
    expect(isPlaying()).toBe(false)
  })

  it('leaves Ctrl+Z to a widget that handles it itself', async () => {
    const user = await renderApp()
    await addTrack(user)
    const widget = addToPage(element('div', { tabindex: '0' }))
    widget.addEventListener('keydown', (e) => {
      if (e.code === 'KeyZ') e.preventDefault()
    })
    widget.focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(trackCount()).toBe(2)
  })

  it('toggles a focused checkbox instead of playing the song', async () => {
    const user = await renderApp()
    const box = addToPage(element('input', { type: 'checkbox' })) as HTMLInputElement
    box.focus()
    await user.keyboard(' ')
    await settle()
    expect(box.checked).toBe(true)
    expect(isPlaying()).toBe(false)
  })
})

describe('in a text field', () => {
  it('Space types into the project name instead of playing the song', async () => {
    const user = await renderApp()
    const name = screen.getByPlaceholderText('Untitled')
    await user.click(name)
    await user.keyboard(' ')
    await settle()
    expect(name).toHaveValue('Untitled Soundscape ')
    expect(isPlaying()).toBe(false)
  })

  it('Ctrl+Z and Ctrl+S in the project name leave the song alone', async () => {
    const user = await renderApp()
    await addTrack(user)
    await user.click(screen.getByPlaceholderText('Untitled'))
    await user.keyboard('{Control>}z{/Control}{Control>}s{/Control}')
    expect(trackCount()).toBe(2)
    expect(downloads).toEqual([])
  })

  it('Space types into a textarea instead of playing the song', async () => {
    const user = await renderApp()
    const area = addToPage(element('textarea')) as HTMLTextAreaElement
    area.focus()
    await user.keyboard(' ')
    await settle()
    expect(area).toHaveValue(' ')
    expect(isPlaying()).toBe(false)
  })

  it('Space in a contenteditable field does not play the song', async () => {
    const user = await renderApp()
    addToPage(element('div', { contenteditable: 'true', tabindex: '0' })).focus()
    await user.keyboard(' ')
    await settle()
    expect(isPlaying()).toBe(false)
  })

  it('Ctrl+Z and Ctrl+S in a contenteditable field leave the song alone', async () => {
    const user = await renderApp()
    await addTrack(user)
    addToPage(element('div', { contenteditable: 'true', tabindex: '0' })).focus()
    await user.keyboard('{Control>}z{/Control}{Control>}s{/Control}')
    expect(trackCount()).toBe(2)
    expect(downloads).toEqual([])
  })
})

describe('the piano roll, with notes selected', () => {
  /** Draw one note, switch to the select tool and select everything. */
  async function selectOneNote(user: ReturnType<typeof userEvent.setup>) {
    const cell = document.querySelector('.note-editor-cell')!
    fireEvent.mouseDown(cell)
    fireEvent.mouseUp(cell)
    await user.click(screen.getByRole('button', { name: 'Select' }))
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Control>}a{/Control}')
    expect(document.querySelectorAll('.note-editor-cell.selected')).toHaveLength(1)
  }
  const noteCount = () => document.querySelectorAll('.note-editor-cell.has-note').length

  it('Backspace in the project name keeps them', async () => {
    const user = await renderApp()
    await selectOneNote(user)
    await user.click(screen.getByPlaceholderText('Untitled'))
    await user.keyboard('{Backspace}')
    expect(noteCount()).toBe(1)
  })

  it('Backspace in a contenteditable field keeps them, and on the page deletes them', async () => {
    const user = await renderApp()
    await selectOneNote(user)
    const field = addToPage(element('div', { contenteditable: 'true', tabindex: '0' }))
    field.focus()
    await user.keyboard('{Backspace}')
    expect(noteCount()).toBe(1)
    field.blur()
    await user.keyboard('{Backspace}')
    expect(noteCount()).toBe(0)
  })
})
