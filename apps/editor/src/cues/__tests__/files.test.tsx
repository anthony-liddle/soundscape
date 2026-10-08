import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../../test/setup'
import { installFakeAudio } from '../../test/fakeAudio'
import App from '../../App'
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard'
import twoCues from '../../../../../examples/cues/peach.cues.json?raw'

/**
 * Opening and saving cue files in the real app: through parseCueDocument and
 * serializeCueDocument, from the Cues view's Open and from the song's Import.
 */

let saved: { name: string; blob: Blob }[]

beforeEach(() => {
  resetMockUuid()
  installFakeAudio()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  saved = []
  let lastBlob: Blob | null = null
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      lastBlob = blob
      return 'blob:soundscape'
    },
    revokeObjectURL: () => {},
  }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (lastBlob) saved.push({ name: this.download, blob: lastBlob })
  })
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

async function renderApp(address = '/?view=cues') {
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

const cueView = () => document.querySelector('.cue-view') as HTMLElement | null
const file = (text: string, name = 'peach.cues.json') => new File([text], name, { type: 'application/json' })

/** Opens through the Cues view's file input, and waits until the file has been read. */
async function openInCues(user: User, text: string, name?: string) {
  await user.upload(within(cueView()!).getByLabelText('Cue file to open'), file(text, name))
  await waitFor(() => expect(within(cueView()!).getByRole('status')).not.toHaveTextContent(/^$/))
}

/** One note's level made invalid, or a key repeated, in the two-cue example. */
const badLevel = twoCues.replace('"level": 0.021599999999999998', '"level": 2')
const repeatedKey = twoCues.replace('"level": 0.021599999999999998', '"level": 0.02, "level": 0.021599999999999998')

describe("the Cues view's Open", () => {
  it('opens a cue file and lists its cues', async () => {
    const user = await renderApp()
    await openInCues(user, twoCues)
    const list = within(cueView()!).getByRole('navigation', { name: 'Cues' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('found-8-mythic-cute'),
      expect.stringContaining('tick'),
    ])
    expect(within(cueView()!).getByRole('status')).toHaveTextContent('Opened peach.cues.json: 2 cues.')
  })

  it('refuses a file with problems, naming the path to each, and opens nothing', async () => {
    const user = await renderApp()
    await openInCues(user, badLevel, 'bad.cues.json')
    const alert = within(cueView()!).getByRole('alert')
    expect(alert).toHaveTextContent('bad.cues.json was not opened')
    expect(alert).toHaveTextContent('cues.tick.notes[0].level')
    expect(alert).toHaveTextContent('must be a linear gain above 0 and at most 1')
    expect(within(cueView()!).queryByRole('navigation', { name: 'Cues' })).toBeNull()
  })

  it('refuses a key repeated in one object, which JSON.parse would quietly resolve', async () => {
    const user = await renderApp()
    await openInCues(user, repeatedKey)
    expect(within(cueView()!).getByRole('alert')).toHaveTextContent('appears more than once in its object')
  })

  it('refuses text that is not JSON', async () => {
    const user = await renderApp()
    await openInCues(user, '{ "format": ')
    expect(within(cueView()!).getByRole('alert')).toHaveTextContent('is not valid JSON')
  })
})

describe("the Cues view's Save", () => {
  it('writes the canonical document, the same bytes as the file opened', async () => {
    const user = await renderApp()
    await openInCues(user, twoCues)
    await user.click(within(cueView()!).getByRole('button', { name: 'Save' }))
    expect(saved.map((s) => s.name)).toEqual(['peach.cues.json'])
    expect(await saved[0]!.blob.text()).toBe(twoCues)
  })

  it('saves with Ctrl+S while the cues are in front', async () => {
    const user = await renderApp()
    await openInCues(user, twoCues)
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Control>}s{/Control}')
    expect(saved.map((s) => s.name)).toEqual(['peach.cues.json'])
  })

  it('says there is nothing to save when no file is open', async () => {
    const user = await renderApp()
    await user.keyboard('{Control>}s{/Control}')
    expect(saved).toEqual([])
    expect(within(cueView()!).getByRole('status')).toHaveTextContent('Nothing to save: no cue file is open.')
  })
})

describe("the song's Import, given a cue file", () => {
  /** Imports through the song's file input, and waits for the import to read it. */
  async function importIntoSong(user: User, text: string) {
    const input = document.querySelector('.import-export input[type=file]') as HTMLInputElement
    await user.upload(input, file(text))
    // Import reads with a FileReader, which reports after the upload resolves
    await waitFor(() => expect(vi.mocked(confirm).mock.calls.length + vi.mocked(alert).mock.calls.length).toBeGreaterThan(0))
  }

  it('offers the Cues view, and opens the file there', async () => {
    const user = await renderApp('/')
    expect(cueView()).toBeNull()
    await importIntoSong(user, twoCues)
    expect(confirm).toHaveBeenCalledWith('peach.cues.json is a cue file, not a song. Open it in the Cues view?')
    expect(alert).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?view=cues')
    expect(within(cueView()!).getByRole('status')).toHaveTextContent('Opened peach.cues.json: 2 cues.')
  })

  it('leaves everything as it was when the offer is declined', async () => {
    vi.mocked(confirm).mockReturnValue(false)
    const user = await renderApp('/')
    await importIntoSong(user, twoCues)
    expect(alert).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(cueView()).toBeNull()
  })

  it('hands over the text itself, so a repeated key is still refused', async () => {
    const user = await renderApp('/')
    await importIntoSong(user, repeatedKey)
    expect(within(cueView()!).getByRole('alert')).toHaveTextContent('appears more than once in its object')
  })

  it('still imports a song as a song', async () => {
    const user = await renderApp('/')
    const song = JSON.stringify({
      metadata: { name: 'Imported', tempo: 100, timeSignature: [4, 4], lengthBeats: 16 },
      tracks: [{ id: 't1', name: 'Only', presetId: 'lead', notes: [] }],
      mixer: { tracks: { t1: { volume: 0.8, mute: false, solo: false } }, masterVolume: 0.8 },
    })
    await user.upload(document.querySelector('.import-export input[type=file]') as HTMLInputElement, file(song))
    expect(await screen.findByDisplayValue('Imported')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('the unsaved changes guard', () => {
  function Guarded({ dirty }: { dirty: boolean }) {
    useUnsavedChangesGuard(dirty)
    return null
  }
  const leave = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))

  it('asks before the page is left with unsaved edits', () => {
    render(<Guarded dirty />)
    expect(leave()).toBe(false)
  })

  it('lets the page go once there is nothing unsaved', () => {
    const { rerender } = render(<Guarded dirty />)
    rerender(<Guarded dirty={false} />)
    expect(leave()).toBe(true)
  })
})
