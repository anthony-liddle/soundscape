import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioEngine } from 'soundscape-engine'
import { resetMockUuid } from '../../test/setup'
import { installFakeAudio, installFakeOfflineAudio, liveAudioContextsMade } from '../../test/fakeAudio'
import App from '../../App'
import twoCues from '../../../../../examples/cues/peach.cues.json?raw'

/**
 * Hearing and seeing a cue in the real app: playing through the cue path in
 * the view's own engine, made on the first Play, and the selected cue drawn
 * from an offline render after every committed edit.
 */

beforeEach(() => {
  resetMockUuid()
  installFakeAudio()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
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

const status = () => within(document.querySelector('.cue-view') as HTMLElement).getByRole('status')

describe('playing', () => {
  it('plays the selected cue through loadCues and playCue, never previewNote', async () => {
    const loadCues = vi.spyOn(AudioEngine.prototype, 'loadCues')
    const playCue = vi.spyOn(AudioEngine.prototype, 'playCue')
    const previewNote = vi.spyOn(AudioEngine.prototype, 'previewNote')
    const { user } = await openExample()
    await user.click(screen.getByRole('button', { name: 'Play found-8-mythic-cute' }))
    await waitFor(() => expect(playCue).toHaveBeenCalledWith('found-8-mythic-cute'))
    expect(Object.keys((loadCues.mock.calls[0]![0] as { cues: object }).cues)).toEqual(['found-8-mythic-cute', 'tick'])
    expect(previewNote).not.toHaveBeenCalled()
    expect(status()).toHaveTextContent('Played found-8-mythic-cute.')
  })

  it('plays one note alone, from a document holding only that note and its instrument', async () => {
    const loadCues = vi.spyOn(AudioEngine.prototype, 'loadCues')
    const playCue = vi.spyOn(AudioEngine.prototype, 'playCue')
    const { user } = await openExample()
    await user.click(screen.getByRole('button', { name: 'Play found-8-sparkle alone' }))
    await waitFor(() => expect(playCue).toHaveBeenCalledWith('audition'))
    const loaded = loadCues.mock.calls[0]![0] as { instruments: object; cues: { audition: { notes: object[] } } }
    expect(Object.keys(loaded.instruments)).toEqual(['sine'])
    expect(loaded.cues.audition.notes).toEqual([
      { id: 'found-8-sparkle', instrument: 'sine', start: 0, duration: 0.12, pitch: 98.01953075366262, level: 0.018 },
    ])
  })

  it('plays the selected cue on Space', async () => {
    const playCue = vi.spyOn(AudioEngine.prototype, 'playCue')
    const { user } = await openExample('tick')
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard(' ')
    await waitFor(() => expect(playCue).toHaveBeenCalledWith('tick'))
  })

  it('makes its own engine on the first Play, and not before', async () => {
    const { user } = await openExample()
    const songs = liveAudioContextsMade()
    expect(songs).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Play found-8-mythic-cute' }))
    await waitFor(() => expect(status()).toHaveTextContent('Played'))
    expect(liveAudioContextsMade()).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Play found-8-mythic-cute' }))
    expect(liveAudioContextsMade()).toBe(2)
  })

  it('is off while the document has problems, saying which cues and why', async () => {
    const { user, view } = await openExample()
    const level = screen.getByRole('textbox', { name: 'Level of found-8-sparkle, linear' })
    await user.clear(level)
    await user.type(level, '2{Enter}')
    const play = screen.getByRole('button', { name: 'Play found-8-mythic-cute' })
    expect(play).toBeDisabled()
    expect(play).toHaveAccessibleDescription('Play is off until 1 problem is fixed, in found-8-mythic-cute.')
    expect(screen.getByRole('button', { name: 'Play found-8-sparkle alone' })).toBeDisabled()
    const list = within(view).getByRole('navigation', { name: 'Cues' })
    expect(within(list).getByRole('button', { name: /^found-8-mythic-cute/ })).toHaveTextContent('1 problem')
  })
})

describe('the drawing', () => {
  it('is drawn from an offline render, labelled with its length and peak', async () => {
    installFakeOfflineAudio()
    await openExample()
    // The last note ends at 280 ms and releases over 10 ms; the fake peaks at 0.5
    expect(await screen.findByText('Length 290 ms, peak -6.02 dBFS')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'found-8-mythic-cute: length 290 ms, peak -6.02 dBFS' })).toBeInTheDocument()
  })

  it('is drawn again after each committed edit', async () => {
    installFakeOfflineAudio()
    const { user } = await openExample()
    await screen.findByText('Length 290 ms, peak -6.02 dBFS')
    const duration = screen.getByRole('textbox', { name: 'Duration of found-8-note, in milliseconds' })
    await user.clear(duration)
    await user.type(duration, '300')
    // Not drawn again while typing
    expect(screen.getByText('Length 290 ms, peak -6.02 dBFS')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Length 310 ms, peak -6.02 dBFS')).toBeInTheDocument()
  })

  it('says why it is not drawn while the document has problems', async () => {
    installFakeOfflineAudio()
    const { user } = await openExample()
    const level = screen.getByRole('textbox', { name: 'Level of found-8-sparkle, linear' })
    await user.clear(level)
    await user.type(level, '0{Enter}')
    expect(await screen.findByText('Not drawn until the problems are fixed.')).toBeInTheDocument()
  })

  it('says so quietly where there is no OfflineAudioContext', async () => {
    const error = vi.spyOn(console, 'error')
    await openExample()
    expect(screen.getByText('Not drawn: this browser cannot render offline.')).toBeInTheDocument()
    expect(error).not.toHaveBeenCalled()
  })
})
