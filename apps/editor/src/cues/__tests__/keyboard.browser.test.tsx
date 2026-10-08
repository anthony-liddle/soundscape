import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { server, userEvent } from 'vitest/browser'
import App from '../../App'
import twoCues from '../../../../../examples/cues/peach.cues.json?raw'

/**
 * The whole job in the Cues view by keyboard, in a real browser, so focus and
 * :focus-visible are the browser's own: open a file, choose a cue and a note,
 * edit a value, add a note and delete it, play, undo, redo and save. The one step
 * that is not a key is the file chooser itself, which belongs to the browser;
 * Open is pressed with Enter, and the test hands over the file it would return.
 *
 * WebKit on macOS moves Tab past buttons, as Safari does unless its keyboard
 * navigation setting is on, so the run is Chromium's and Firefox's.
 */

let saved: string[]
let errors: unknown[]

beforeEach(() => {
  saved = []
  errors = []
  let lastBlob: Blob | null = null
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    lastBlob = blob as Blob
    return 'blob:soundscape'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    if (lastBlob) void lastBlob.text().then((t) => saved.push(t))
  })
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args))
  window.history.replaceState(null, '', '?view=cues')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '?')
})

const active = () => document.activeElement as HTMLElement
/** Text as a screen reader reads it, without what is aria-hidden. */
function spokenText(el: Element): string {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  return copy.textContent?.trim() ?? ''
}

/** The name a screen reader would give: aria-label, else its label's text, else its own text. */
const nameOf = (el: Element) => {
  const label = (el as HTMLInputElement).labels?.[0]
  return el.getAttribute('aria-label') ?? (label ? spokenText(label) : spokenText(el))
}
const describe_ = (el: Element) => `${el.tagName.toLowerCase()} "${nameOf(el)}"`

/** Every element focus lands on, and those it landed on without a visible outline. */
const visited: string[] = []
const unseen: string[] = []

/**
 * Firefox can report a just-focused element's style before :focus-visible
 * applies, so the outline gets 200 ms to appear before it counts as unseen.
 */
async function noteFocus() {
  const el = active()
  if (el === document.body) return
  visited.push(describe_(el))
  const outlined = () => {
    const style = getComputedStyle(el)
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
  }
  for (let i = 0; i < 10 && !outlined(); i++) await new Promise((r) => setTimeout(r, 20))
  if (!outlined()) unseen.push(describe_(el))
}

/** Presses Tab, or Shift+Tab, until focus reaches what `wanted` names. */
async function tabTo(wanted: string | RegExp, backwards = false) {
  const matches = (el: Element) => (typeof wanted === 'string' ? nameOf(el) === wanted : wanted.test(nameOf(el)))
  for (let i = 0; i < 400; i++) {
    await userEvent.tab({ shift: backwards })
    await noteFocus()
    if (matches(active())) return active()
  }
  throw new Error(`Tab never reached ${wanted}; visited: ${visited.filter((v) => /found|ilter|edition|tick/.test(v)).slice(0, 14).join(" | ")}`)
}

async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const status = () => document.querySelector('.cue-view [role=status]')!.textContent ?? ''
const heading = () => document.querySelector('#cue-notes-heading')?.textContent
const rowIds = () => [...document.querySelectorAll('.cue-notes tbody th')].map((th) => th.textContent!.replace('▸', '').replace(' (selected)', ''))

describe('the Cues view, by keyboard alone', () => {
  it.skipIf(server.browser === 'webkit')('opens, edits, adds, deletes, plays, undoes, redoes and saves', async () => {
    render(<App />)

    // Open, pressed with Enter; the browser's chooser is stood in for
    await tabTo('Open')
    await userEvent.keyboard('{Enter}')
    const input = document.querySelector<HTMLInputElement>('.cue-view input[type=file]')!
    await userEvent.upload(input, new File([twoCues], 'peach.cues.json', { type: 'application/json' }))
    await waitFor(() => status().startsWith('Opened'), 'the file to open')

    // Choose a cue: narrow the list, then press it. Open chose the first cue,
    // so choose another, then come back
    await tabTo('Filter cues')
    await userEvent.keyboard('tick')
    await tabTo(/^tick/)
    await userEvent.keyboard('{Enter}')
    await waitFor(() => heading() === 'tick', 'tick to be chosen')
    await tabTo('Filter cues', true)
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}mythic')
    await tabTo(/^found-8-mythic-cute/)
    await userEvent.keyboard('{Enter}')
    await waitFor(() => heading() === 'found-8-mythic-cute', 'found-8-mythic-cute to be chosen')

    // Choose a note: focus into its row selects it, shown in text, not colour alone
    const level = await tabTo('Level of found-8-sparkle, linear')
    const row = level.closest('tr')!
    expect(row.querySelector('th')!.textContent).toContain('(selected)')
    expect(row.querySelector('th')!.textContent).toContain('▸')

    // Edit a value
    await userEvent.keyboard(`{End}${'{Backspace}'.repeat(5)}0.02{Enter}`)
    await waitFor(() => (level as HTMLInputElement).value === '0.02', 'the level to change')

    // Add a note after it, from its own row: focus lands on the new note's first field
    await tabTo('Add note after found-8-sparkle')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => nameOf(active()) === 'Instrument of found-8-mythic-cute-6', 'focus on the added note')
    await noteFocus()

    // Delete it again
    await tabTo('Remove found-8-mythic-cute-6')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => !rowIds().includes('found-8-mythic-cute-6'), 'the note to go')
    await waitFor(() => nameOf(active()) === 'Instrument of found-8-mythic-glint', 'focus on the next note')
    await noteFocus()

    // Play the cue
    await tabTo('Play found-8-mythic-cute', true)
    await userEvent.keyboard('{Enter}')
    await waitFor(() => status() === 'Played found-8-mythic-cute.', 'the cue to play')

    // Undo twice, from the Play button: the delete, then the add
    await userEvent.keyboard('{Control>}z{/Control}')
    await waitFor(() => rowIds().includes('found-8-mythic-cute-6'), 'the delete to be undone')
    await userEvent.keyboard('{Control>}z{/Control}')
    await waitFor(() => !rowIds().includes('found-8-mythic-cute-6'), 'the add to be undone')

    // Redo twice, once with each key: the add, then the delete
    await userEvent.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}')
    await waitFor(() => rowIds().includes('found-8-mythic-cute-6'), 'the add to be redone')
    await userEvent.keyboard('{Control>}y{/Control}')
    await waitFor(() => !rowIds().includes('found-8-mythic-cute-6'), 'the delete to be redone')

    // Save: only the edited level differs from the file opened
    await userEvent.keyboard('{Control>}s{/Control}')
    await waitFor(() => saved.length === 1, 'the save')
    const before = twoCues.split('\n')
    expect(saved[0]!.split('\n').filter((line, i) => line !== before[i])).toEqual(['          "level": 0.02'])

    expect(unseen).toEqual([])
    expect(visited.length).toBeGreaterThan(20)
    expect(errors).toEqual([])
  })
})

describe('names, in a real browser', () => {
  it('names every field in the table with its note, and every instrument field with its instrument', async () => {
    render(<App />)
    const input = document.querySelector<HTMLInputElement>('.cue-view input[type=file]')!
    await userEvent.upload(input, new File([twoCues], 'peach.cues.json', { type: 'application/json' }))
    await waitFor(() => status().startsWith('Opened'), 'the file to open')
    const rows = [...document.querySelectorAll('.cue-notes tbody tr')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const id = row.querySelector('th')!.textContent!.replace('▸', '').replace(' (selected)', '')
      for (const control of row.querySelectorAll('input, select, button, summary')) expect(nameOf(control)).toContain(id)
    }
    for (const button of document.querySelectorAll('.cue-list-item')) expect(nameOf(button)).toMatch(/^[\w-]+, \d+ notes?/)
    for (const control of document.querySelectorAll('.cue-instrument input, .cue-instrument select')) {
      if ((control as HTMLInputElement).type === 'radio') continue
      expect(nameOf(control)).toMatch(/of instrument \w+/)
    }
  })
})
