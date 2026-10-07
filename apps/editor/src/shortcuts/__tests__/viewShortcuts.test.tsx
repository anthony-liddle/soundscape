import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMockUuid } from '../../test/setup'
import { installFakeAudio } from '../../test/fakeAudio'
import { SoundscapeProvider } from '../../state'
import { SoundscapeApp } from '../../App'
import { ShortcutsProvider, useViewShortcuts } from '..'

/**
 * The shared shortcuts go to the view in front. The song view is the real
 * one; the second view stands in for the next view the editor gets, and
 * writes down what each shortcut asked it to do.
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
})

let asked: string[]

function SecondView({ active = true }: { active?: boolean }) {
  useViewShortcuts(
    {
      togglePlay: () => asked.push('togglePlay'),
      undo: () => asked.push('undo'),
      redo: () => asked.push('redo'),
      save: () => asked.push('save'),
    },
    active
  )
  return <button type="button">A control in the second view</button>
}

function shell(second: ReactNode) {
  return (
    <SoundscapeProvider>
      <ShortcutsProvider>
        <SoundscapeApp />
        {second}
      </ShortcutsProvider>
    </SoundscapeProvider>
  )
}

async function renderShell(second: ReactNode, wrap = (node: ReactNode) => node) {
  asked = []
  const user = userEvent.setup()
  const view = render(<>{wrap(shell(second))}</>)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { user, rerender: (next: ReactNode) => view.rerender(<>{wrap(shell(next))}</>) }
}

const isPlaying = () => screen.getByRole('button', { name: /^(Play|Stop)$/ }).textContent === 'Stop'
const trackCount = () => document.querySelectorAll('.track-item').length
const settle = () => act(async () => {})

async function addTrack(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Add Track' }))
  ;(document.activeElement as HTMLElement).blur()
}

describe('a second view in front', () => {
  it('takes Space, and the song does not play', async () => {
    const { user } = await renderShell(<SecondView />)
    await user.keyboard(' ')
    await settle()
    expect(asked).toEqual(['togglePlay'])
    expect(isPlaying()).toBe(false)
  })

  it('takes Ctrl+Z, and the song does not undo', async () => {
    const { user } = await renderShell(<SecondView />)
    await addTrack(user)
    await user.keyboard('{Control>}z{/Control}')
    expect(asked).toEqual(['undo'])
    expect(trackCount()).toBe(2)
  })

  it('takes Ctrl+Shift+Z and Ctrl+Y, and the song does not redo', async () => {
    const { user, rerender } = await renderShell(<SecondView active={false} />)
    await addTrack(user)
    await user.keyboard('{Control>}z{/Control}')
    expect(trackCount()).toBe(1)
    rerender(<SecondView />)
    await user.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}{Control>}y{/Control}')
    expect(asked).toEqual(['redo', 'redo'])
    expect(trackCount()).toBe(1)
  })

  it('takes Ctrl+S, and the song is not downloaded', async () => {
    const { user } = await renderShell(<SecondView />)
    await user.keyboard('{Control>}s{/Control}')
    expect(asked).toEqual(['save'])
    expect(downloads).toEqual([])
  })

  it("does not pass the song's Ctrl+D through, and leaves it to the browser", async () => {
    await renderShell(<SecondView />)
    const notPrevented = fireEvent.keyDown(document.body, { key: 'd', code: 'KeyD', ctrlKey: true })
    expect(notPrevented).toBe(true)
    expect(trackCount()).toBe(1)
  })

  it('stays in front while the song re-renders', async () => {
    const { user } = await renderShell(<SecondView />)
    await addTrack(user)
    await user.keyboard(' ')
    await settle()
    expect(asked).toEqual(['togglePlay'])
    expect(isPlaying()).toBe(false)
  })

  it('keeps Space away from a focused control, as the song does', async () => {
    const { user } = await renderShell(<SecondView />)
    screen.getByRole('button', { name: 'A control in the second view' }).focus()
    await user.keyboard(' ')
    expect(asked).toEqual([])
  })

  it('is in front under StrictMode too', async () => {
    const { user } = await renderShell(<SecondView />, (node) => <StrictMode>{node}</StrictMode>)
    await user.keyboard(' ')
    await settle()
    expect(asked).toEqual(['togglePlay'])
    expect(isPlaying()).toBe(false)
  })
})

describe('the song, when the second view leaves the front', () => {
  it('gets the shortcuts back when the second view is no longer active', async () => {
    const { user, rerender } = await renderShell(<SecondView />)
    rerender(<SecondView active={false} />)
    await user.keyboard(' ')
    await settle()
    expect(asked).toEqual([])
    expect(isPlaying()).toBe(true)
  })

  it('gets the shortcuts back when the second view goes away', async () => {
    const { user, rerender } = await renderShell(<SecondView />)
    rerender(null)
    await user.keyboard('{Control>}s{/Control}')
    expect(asked).toEqual([])
    expect(downloads).toEqual(['Untitled_Soundscape.json'])
  })

  it('loses them again when the second view is active again', async () => {
    const { user, rerender } = await renderShell(<SecondView />)
    rerender(<SecondView active={false} />)
    rerender(<SecondView />)
    await user.keyboard(' ')
    await settle()
    expect(asked).toEqual(['togglePlay'])
    expect(isPlaying()).toBe(false)
  })
})
