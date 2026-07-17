import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AudioEngine } from '../AudioEngine'
import { builtInPresets } from '../../presets'
import { createNote, createTrack } from '../../types'
import type { SoundscapeState } from '../../types'
import { createMockAudioContext } from './mockWebAudio'
import type { VoiceSynthesizer } from '../VoiceSynthesizer'

type EngineInternals = {
  trackChannels: Map<string, { activeVoices: Map<string, VoiceSynthesizer>; voices: VoiceSynthesizer[] }>
}

function makeState(noteCount: number): SoundscapeState {
  const track = createTrack('T', 'lead')
  for (let i = 0; i < noteCount; i++) {
    // All notes start together at beat 0 so one scheduling pass allocates
    // every voice at once
    track.notes.push(createNote(60 + i, 0, 4, 100))
  }
  return {
    metadata: { name: 't', tempo: 120, timeSignature: [4, 4], lengthBeats: 16 },
    tracks: [track],
    presets: builtInPresets,
    mixer: { tracks: { [track.id]: { volume: 0.8, mute: false, solo: false } }, masterVolume: 0.8 },
  }
}

describe('AudioEngine voice allocation (characterization)', () => {
  let engine: AudioEngine

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', function () {
      return createMockAudioContext()
    })
  })

  afterEach(() => {
    engine?.destroy()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('allocates distinct voices for up to 8 simultaneous notes', async () => {
    engine = new AudioEngine()
    await engine.initialize()
    const state = makeState(8)
    engine.updateState(state)
    engine.play()

    const channel = (engine as unknown as EngineInternals).trackChannels.get(state.tracks[0]!.id)!
    expect(channel.activeVoices.size).toBe(8)
    expect(new Set(channel.activeVoices.values()).size).toBe(8)
  })

  it('voice stealing removes the stolen note mapping so its noteOff cannot cut the new note (H3 fixed)', async () => {
    // A 9th simultaneous note steals voices[0]. The stolen note's
    // activeVoices entry must be removed (and its scheduled end marked done)
    // so the old note's scheduled noteOff can no longer reach the voice now
    // playing the new note.
    engine = new AudioEngine()
    await engine.initialize()
    const state = makeState(9)
    engine.updateState(state)
    engine.play()

    const track = state.tracks[0]!
    const channel = (engine as unknown as EngineInternals).trackChannels.get(track.id)!
    const firstNoteVoice = channel.activeVoices.get(track.notes[0]!.id)
    const ninthNoteVoice = channel.activeVoices.get(track.notes[8]!.id)

    expect(firstNoteVoice).toBeUndefined() // stale mapping removed
    expect(ninthNoteVoice).toBeDefined()
    expect(channel.activeVoices.size).toBe(8) // one entry per live voice
  })
})
