import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import App from '../../App'
import peach from '../__fixtures__/peach.cues.json?raw'

/**
 * Peach of a Word's cue file in the Cues view, in a real browser: every cue
 * plays, every field can be passed through without changing a byte, an edit
 * and its undo change nothing, and a real edit changes only what was edited.
 */

const BYTES = 27789
const SHA256_START = 'b66a60d7'
const CUE_COUNT = 34

let saved: Blob[]
let errors: string[]
const onError = (e: ErrorEvent) => errors.push(`error: ${e.message}`)
const onRejection = (e: PromiseRejectionEvent) => errors.push(`unhandled rejection: ${String(e.reason)}`)

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
    if (lastBlob) saved.push(lastBlob)
  })
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(`console.error: ${args.join(' ')}`))
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  window.history.replaceState(null, '', '?view=cues')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.removeEventListener('error', onError)
  window.removeEventListener('unhandledrejection', onRejection)
  window.history.replaceState(null, '', '?')
})

async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 250; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const view = () => document.querySelector('.cue-view') as HTMLElement
const status = () => view().querySelector('[role=status]')!.textContent ?? ''
const cueButton = (name: string) =>
  [...view().querySelectorAll<HTMLButtonElement>('.cue-list-item')].find((b) => b.querySelector('.cue-list-name')!.textContent === name)!

async function openPeach(): Promise<string[]> {
  render(<App />)
  const input = view().querySelector<HTMLInputElement>('input[type=file]')!
  await userEvent.upload(input, new File([peach], 'peach.cues.json', { type: 'application/json' }))
  await waitFor(() => status() === `Opened peach.cues.json: ${CUE_COUNT} cues.`, 'Peach to open')
  return [...view().querySelectorAll('.cue-list-name')].map((n) => n.textContent!)
}

async function chooseCue(name: string) {
  await userEvent.click(cueButton(name))
  await waitFor(() => view().querySelector('#cue-notes-heading')?.textContent === name, `${name} to be chosen`)
}

async function saveWithKeys(): Promise<Blob> {
  const count = saved.length
  ;(document.activeElement as HTMLElement | null)?.blur()
  await userEvent.keyboard('{Control>}s{/Control}')
  await waitFor(() => saved.length > count, 'the save')
  return saved[saved.length - 1]!
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Lines that differ, by position: the file's line, then the saved one. */
async function changedLines(blob: Blob): Promise<[string, string][]> {
  const before = peach.split('\n')
  const after = (await blob.text()).split('\n')
  expect(after).toHaveLength(before.length)
  return before.flatMap((line, i) => (line === after[i] ? [] : [[line, after[i]!] as [string, string]]))
}

describe("Peach of a Word's cue file", () => {
  it('opens, and every one of its 34 cues plays without an error', async () => {
    const names = await openPeach()
    expect(names).toHaveLength(CUE_COUNT)
    for (const name of names) {
      await chooseCue(name)
      await userEvent.click(view().querySelector<HTMLButtonElement>(`button[aria-label="Play ${name}"]`)!)
      await waitFor(() => status().startsWith(`Played ${name}.`) || status().startsWith('Could not play'), `${name} to play`)
      expect(status()).toBe(`Played ${name}.`)
    }
    expect(errors).toEqual([])
  })

  it('saves its exact bytes after Tab has passed through every field of every cue', async () => {
    const names = await openPeach()
    let fields = 0
    for (const name of names) {
      await chooseCue(name)
      // From the cue's own button, Tab through its notes and its instrument
      const main = view().querySelector('main')!
      const stops = [...main.querySelectorAll('input:not([type=radio]), select')]
      const last = stops[stops.length - 1]!
      cueButton(name).focus()
      for (let i = 0; i < 300 && document.activeElement !== last; i++) {
        await userEvent.tab()
        if (document.activeElement?.matches('.cue-view main input:not([type=radio]), .cue-view main select')) fields++
      }
      expect(document.activeElement).toBe(last)
    }
    const blob = await saveWithKeys()
    expect(blob.size).toBe(BYTES)
    expect((await sha256(blob)).startsWith(SHA256_START)).toBe(true)
    expect(await blob.text()).toBe(peach)
    // 117 notes with 5 fields each, and 34 cues showing an instrument with 18
    expect(fields).toBe(117 * 5 + 34 * 18)
    expect(errors).toEqual([])
  })

  it('saves its exact bytes after an edit and its undo', async () => {
    await openPeach()
    await chooseCue('found-8-mythic-cute')
    const level = view().querySelector<HTMLInputElement>('input[aria-label="Level of found-8-mythic-cute-3, linear"]')!
    await userEvent.fill(level, '0.02')
    await userEvent.keyboard('{Enter}')
    expect(view().querySelector('header')!.textContent).toContain('(unsaved)')
    cueButton('found-8-mythic-cute').focus()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(level.value).toBe('0.018')
    const blob = await saveWithKeys()
    expect(blob.size).toBe(BYTES)
    expect((await sha256(blob)).startsWith(SHA256_START)).toBe(true)
    expect(errors).toEqual([])
  })

  it('hides the last drawing while the file has a problem, rather than show a stale one', async () => {
    await openPeach()
    await chooseCue('found-8-mythic-cute')
    await waitFor(() => /^Length 290 ms, peak /.test(view().querySelector('.cue-waveform-label')!.textContent!), 'the drawing')
    const canvas = view().querySelector('.cue-waveform canvas')!
    expect(getComputedStyle(canvas).display).not.toBe('none')
    const level = view().querySelector<HTMLInputElement>('input[aria-label="Level of found-8-mythic-cute-3, linear"]')!
    await userEvent.fill(level, '2')
    await userEvent.keyboard('{Enter}')
    expect(view().querySelector('.cue-waveform-label')!.textContent).toBe('Not drawn until the problems are fixed.')
    expect(getComputedStyle(canvas).display).toBe('none')
  })

  it('changes only the value edited, and nothing else', async () => {
    await openPeach()
    await chooseCue('edition')
    const start = view().querySelector<HTMLInputElement>('input[aria-label="Start of edition-4, in milliseconds"]')!
    expect(start.value).toBe('300.00000000000004')
    await userEvent.fill(start, '300')
    await userEvent.keyboard('{Enter}')
    const blob = await saveWithKeys()
    expect(blob.size).not.toBe(BYTES)
    expect(await changedLines(blob)).toEqual([['          "start": 0.30000000000000004,', '          "start": 0.3,']])
    expect(errors).toEqual([])
  })
})
