import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../../test/setup'
import { installFakeAudio } from '../../test/fakeAudio'
import App from '../../App'
import twoCues from '../../../../../examples/cues/peach.cues.json?raw'

/**
 * The cue fields, in the real app on the two-cue example: each shows the
 * stored value exactly, writes back only what was typed, and says what is
 * wrong where it is wrong.
 */

let saved: string[]

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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    if (lastBlob) void lastBlob.text().then((t) => saved.push(t))
  })
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

async function openExample() {
  window.history.replaceState(null, '', '/?view=cues')
  const user = userEvent.setup()
  render(<App />)
  await act(async () => {
    await Promise.resolve()
  })
  const view = document.querySelector('.cue-view') as HTMLElement
  await user.upload(within(view).getByLabelText('Cue file to open'), new File([twoCues], 'peach.cues.json'))
  await within(view).findByRole('navigation', { name: 'Cues' })
  await user.click(within(view).getByRole('button', { name: /^found-8-mythic-cute/ }))
  return { user, view }
}

type User = Awaited<ReturnType<typeof openExample>>['user']

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
const start3 = () => field('Start of found-8-sparkle, in milliseconds')
const level3 = () => field('Level of found-8-sparkle, linear')
const unsaved = () => document.querySelector('.cue-view header')!.textContent!.includes('(unsaved)')

async function save(user: User) {
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved.length).toBeGreaterThan(0))
  return saved[saved.length - 1]!
}

/** The one line of a saved file that differs from the example, or every line if more than one does. */
function changedLines(text: string): string[] {
  const before = twoCues.split('\n')
  return text.split('\n').filter((line, i) => line !== before[i])
}

describe('what a field shows', () => {
  it('shows each value as the file stores it, start and duration in milliseconds', async () => {
    await openExample()
    expect(field('Pitch of found-8-note, MIDI').value).toBe('78.99998074500876')
    expect(start3().value).toBe('40')
    expect(field('Duration of found-8-note, in milliseconds').value).toBe('280')
    expect(level3().value).toBe('0.018')
  })

  it('names every field with its note', async () => {
    await openExample()
    for (const id of ['found-8-note', 'found-8-octave', 'found-8-sparkle', 'found-8-mythic-glint', 'found-8-cute-glint']) {
      for (const name of ['Start', 'Duration']) field(`${name} of ${id}, in milliseconds`)
      field(`Pitch of ${id}, MIDI`)
      field(`Level of ${id}, linear`)
      screen.getByRole('combobox', { name: `Instrument of ${id}` })
    }
  })

  it('reads out the stored seconds, the note and cents, hertz, the relation to note 1, and dBFS', async () => {
    await openExample()
    const describedBy = (input: HTMLElement) =>
      input.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent).join(' ')
    expect(describedBy(start3())).toContain('0.04 s')
    expect(describedBy(field('Pitch of found-8-note, MIDI'))).toBe('G5 0.00¢, 783.99 Hz, note 1')
    expect(describedBy(field('Pitch of found-8-cute-glint, MIDI'))).toBe('B7 -13.69¢, 3919.95 Hz, 5 × note 1')
    expect(describedBy(field('Pitch of found-8-sparkle, MIDI'))).toBe('D7 +1.95¢, 2351.97 Hz, 3 × note 1')
    expect(describedBy(level3())).toBe('-34.89 dBFS')
  })

  it('has no range input bound to a value', async () => {
    const { view } = await openExample()
    expect(view.querySelectorAll('input[type=range]')).toHaveLength(0)
  })
})

describe('what a field writes back', () => {
  it('writes nothing when a field is entered and left untouched, so the file saves as it was', async () => {
    const { user, view } = await openExample()
    for (const input of within(view).getAllByRole('textbox')) {
      await user.click(input)
      await user.tab()
    }
    expect(unsaved()).toBe(false)
    expect(await save(user)).toBe(twoCues)
  })

  it('writes typed text on Enter, and not before', async () => {
    const { user } = await openExample()
    await user.clear(start3())
    await user.type(start3(), '41')
    expect(unsaved()).toBe(false)
    await user.keyboard('{Enter}')
    expect(unsaved()).toBe(true)
    expect(changedLines(await save(user))).toEqual(['          "start": 0.041,'])
  })

  it('writes typed text when focus leaves', async () => {
    const { user } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '0.02')
    await user.tab()
    expect(changedLines(await save(user))).toEqual(['          "level": 0.02'])
  })

  it('puts the stored value back on Escape', async () => {
    const { user } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '0.5{Escape}')
    expect(level3().value).toBe('0.018')
    await user.tab()
    expect(unsaved()).toBe(false)
  })

  it('moves a start by 1 ms on ArrowUp, and by 10 ms with Shift', async () => {
    const { user } = await openExample()
    await user.click(start3())
    await user.keyboard('{ArrowUp}')
    expect(start3().value).toBe('41')
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
    expect(start3().value).toBe('51')
    expect(changedLines(await save(user))).toEqual(['          "start": 0.051,'])
  })

  it('stops a start at 0 on ArrowDown', async () => {
    const { user } = await openExample()
    const start1 = field('Start of found-8-note, in milliseconds')
    await user.click(start1)
    await user.keyboard('{ArrowDown}')
    expect(start1.value).toBe('0')
    expect(unsaved()).toBe(false)
  })

  it('writes nothing for text that is not a number, and says so on the field', async () => {
    const { user } = await openExample()
    await user.clear(level3())
    await user.type(level3(), 'loud{Enter}')
    expect(level3()).toHaveAttribute('aria-invalid', 'true')
    expect(level3()).toHaveAccessibleDescription(expect.stringContaining('Type a number'))
    expect(unsaved()).toBe(false)
  })

  it('undoes with Ctrl+Z once focus has left the field', async () => {
    const { user, view } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '0.02{Enter}')
    within(view).getByRole('button', { name: /^tick/ }).focus()
    await user.keyboard('{Control>}z{/Control}')
    await user.click(within(view).getByRole('button', { name: /^found-8-mythic-cute/ }))
    expect(level3().value).toBe('0.018')
    expect(unsaved()).toBe(false)
  })
})

describe('a problem', () => {
  it('shows on its field, with aria-invalid and its message attached', async () => {
    const { user } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '2{Enter}')
    expect(level3()).toHaveAttribute('aria-invalid', 'true')
    expect(level3()).toHaveAccessibleDescription(expect.stringContaining('must be a linear gain above 0 and at most 1'))
  })

  it('stops Save, and says why', async () => {
    const { user, view } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '2{Enter}')
    await user.click(within(view).getByRole('button', { name: 'Save' }))
    expect(saved).toEqual([])
    expect(within(view).getByRole('status')).toHaveTextContent('Not saved: fix the 1 problem first, so the file opens again.')
  })
})

describe('unsaved edits', () => {
  it('make leaving the page ask first', async () => {
    const { user } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '0.02{Enter}')
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
  })

  it('make opening another file ask first, and stay when the answer is no', async () => {
    vi.mocked(confirm).mockReturnValue(false)
    const { user, view } = await openExample()
    await user.clear(level3())
    await user.type(level3(), '0.02{Enter}')
    await user.upload(within(view).getByLabelText('Cue file to open'), new File([twoCues], 'other.cues.json'))
    expect(confirm).toHaveBeenCalledWith('Discard the unsaved changes to peach.cues.json?')
    expect(level3().value).toBe('0.02')
  })
})
