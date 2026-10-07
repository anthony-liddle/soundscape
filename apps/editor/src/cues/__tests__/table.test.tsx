import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../../test/setup'
import { installFakeAudio } from '../../test/fakeAudio'
import App from '../../App'
import twoCues from '../../../../../examples/cues/peach.cues.json?raw'

/**
 * The note table and the instrument panel, in the real app on the two-cue
 * example: finding a cue, adding and removing notes with focus put somewhere
 * deliberate, a harmonic set only when pressed, and an instrument's fields.
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
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

async function openExample(cue = 'found-8-mythic-cute') {
  window.history.replaceState(null, '', '/?view=cues')
  const user = userEvent.setup()
  render(<App />)
  await act(async () => {
    await Promise.resolve()
  })
  const view = document.querySelector('.cue-view') as HTMLElement
  await user.upload(within(view).getByLabelText('Cue file to open'), new File([twoCues], 'peach.cues.json'))
  await within(view).findByRole('navigation', { name: 'Cues' })
  await user.click(within(view).getByRole('button', { name: new RegExp(`^${cue}`) }))
  return { user, view }
}

type User = Awaited<ReturnType<typeof openExample>>['user']

const rowIds = () => [...document.querySelectorAll('.cue-notes tbody th')].map((th) => th.textContent!.replace(/^▸/, '').replace(' (selected)', ''))
const focusedName = () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent

async function save(user: User) {
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved.length).toBeGreaterThan(0))
  return saved[saved.length - 1]!
}

/** Lines a saved file has more of than the example, and fewer of, counting repeats. */
function difference(text: string) {
  const count = (lines: string[]) => lines.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>())
  const before = count(twoCues.split('\n'))
  const after = count(text.split('\n'))
  const more = (a: Map<string, number>, b: Map<string, number>) =>
    [...a].flatMap(([line, n]) => Array<string>(Math.max(0, n - (b.get(line) ?? 0))).fill(line))
  return { added: more(after, before), removed: more(before, after) }
}

describe('the cue list', () => {
  it('narrows to the cues whose names hold the filter', async () => {
    const { user, view } = await openExample()
    await user.type(within(view).getByRole('searchbox', { name: 'Filter cues' }), 'TICK')
    const list = within(view).getByRole('navigation', { name: 'Cues' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('tick')])
  })
})

describe('adding a note', () => {
  it('copies the selected note right after it, with the next free id, and moves focus to its first field', async () => {
    const { user } = await openExample()
    await user.click(screen.getByRole('textbox', { name: 'Level of found-8-sparkle, linear' }))
    await user.click(screen.getByRole('button', { name: 'Add note after found-8-sparkle' }))
    expect(rowIds()).toEqual([
      'found-8-note',
      'found-8-octave',
      'found-8-sparkle',
      'found-8-mythic-cute-6',
      'found-8-mythic-glint',
      'found-8-cute-glint',
    ])
    expect(focusedName()).toBe('Instrument of found-8-mythic-cute-6')
    const { added, removed } = difference(await save(user))
    expect(removed).toEqual([])
    expect(added).toContain('          "id": "found-8-mythic-cute-6",')
  })
})

describe('removing a note', () => {
  it('moves focus to the next note, or the one before when it was last', async () => {
    const { user } = await openExample()
    await user.click(screen.getByRole('button', { name: 'Remove found-8-sparkle' }))
    expect(rowIds()).not.toContain('found-8-sparkle')
    expect(focusedName()).toBe('Instrument of found-8-mythic-glint')
    await user.click(screen.getByRole('button', { name: 'Remove found-8-cute-glint' }))
    expect(focusedName()).toBe('Instrument of found-8-mythic-glint')
  })

  it('moves focus to Add once the cue is empty, and Add starts it again', async () => {
    const { user } = await openExample('tick')
    await user.click(screen.getByRole('button', { name: 'Remove tick' }))
    expect(rowIds()).toEqual([])
    expect(focusedName()).toBe('Add note')
    await user.keyboard('{Enter}')
    expect(rowIds()).toEqual(['tick-1'])
  })
})

describe('setting a pitch to a harmonic of note 1', () => {
  it('changes nothing until a multiple is pressed, then sets exactly that one', async () => {
    const { user } = await openExample()
    const pitch = screen.getByRole('textbox', { name: 'Pitch of found-8-sparkle, MIDI' }) as HTMLInputElement
    await user.click(screen.getByText('Set to k × note 1', { selector: '#found-8-sparkle-harmonics summary' }))
    expect(pitch.value).toBe('98.01953075366262')
    await user.click(screen.getByRole('button', { name: 'Set the pitch of found-8-sparkle to 2 × note 1' }))
    // Note 1 is 78.99998074500876, so 2 times it is 12 semitones above
    expect(pitch.value).toBe('90.99998074500876')
    expect(pitch).toHaveAccessibleDescription(expect.stringContaining('2 × note 1'))
  })

  it('is not offered on note 1 itself', async () => {
    await openExample()
    expect(document.querySelector('#found-8-note-harmonics')).toBeNull()
    expect(document.querySelector('#found-8-octave-harmonics')).not.toBeNull()
  })
})

describe('the instrument panel', () => {
  const panel = () => within(screen.getByRole('region', { name: /^Instrument sine/ }))

  it('shows the selected note’s instrument, every field named with it, exactly as stored', async () => {
    await openExample()
    expect((panel().getByRole('textbox', { name: 'Attack of instrument sine, normalized' }) as HTMLInputElement).value).toBe('0.07418053232275866')
    expect(panel().getByRole('textbox', { name: 'Attack of instrument sine, normalized' })).toHaveAccessibleDescription('12.000 ms')
    expect((panel().getByRole('textbox', { name: 'Floor of instrument sine' }) as HTMLInputElement).value).toBe('0.000018')
    expect(panel().getByRole('combobox', { name: 'Filter of instrument sine' })).toHaveValue('none')
    expect(panel().getByRole('radio', { name: "Until each note's release" })).toBeChecked()
  })

  it('shows the fields a cue holds at zero as text, and offers no Randomize', async () => {
    await openExample()
    expect(panel().queryByRole('textbox', { name: /Reverb/ })).toBeNull()
    expect(panel().queryByRole('textbox', { name: /Velocity/ })).toBeNull()
    expect(panel().getByText(/Reverb mix: 0/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Randomize/ })).toBeNull()
  })

  it('switches the decay to a fixed length and back as one edit each, never both or neither', async () => {
    const { user, view } = await openExample()
    await user.click(panel().getByRole('radio', { name: 'Fixed length' }))
    expect(panel().getByRole('textbox', { name: 'Decay of instrument sine, normalized' })).toBeInTheDocument()
    expect(within(view).getByRole('status')).not.toHaveTextContent(/problem/)
    const fixed = difference(await save(user))
    expect(fixed.removed).toEqual(['      "decayUntilRelease": true,'])
    expect(fixed.added).toEqual(['      "decay": 0.2,'])
    // One undo puts it back exactly
    within(view).getByRole('button', { name: /^tick/ }).focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(await save(user)).toBe(twoCues)
  })

  it('switches the curve to linear and drops the floor in one edit', async () => {
    const { user } = await openExample()
    await user.selectOptions(panel().getByRole('combobox', { name: 'Curve of instrument sine' }), 'linear')
    expect(panel().queryByRole('textbox', { name: 'Floor of instrument sine' })).toBeNull()
    const { removed, added } = difference(await save(user))
    expect(removed).toEqual(['      "envelopeCurve": "exponential",', '      "envelopeFloor": 0.000018,'])
    expect(added).toEqual(['      "envelopeCurve": "linear",'])
  })

  it('shows a problem on its field', async () => {
    const { user } = await openExample()
    const sustain = panel().getByRole('textbox', { name: 'Sustain of instrument sine, of the peak' })
    await user.clear(sustain)
    await user.type(sustain, '2{Enter}')
    expect(sustain).toHaveAttribute('aria-invalid', 'true')
    expect(sustain).toHaveAccessibleDescription(expect.stringContaining('must be from 0 to 1'))
  })
})
