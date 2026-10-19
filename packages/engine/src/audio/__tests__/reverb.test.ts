import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { mulberry32, reverbImpulse, reverbSeedOf } from '../reverbImpulse'
import { builtInPresets } from '../../presets'
import type { SoundscapeState, Track } from '../../types'

/**
 * The reverb's impulse response, seeded from each track's id. The pinned
 * numbers come from an implementation written apart from this one, from the
 * spec in reverbImpulse.ts alone, so another engine can be held to them too.
 */

/** FNV-1a, 32-bit, over a buffer's bytes: a hash of the bits of every sample. */
function hashOf(...channels: Float32Array[]): string {
  let h = 0x811c9dc5
  for (const data of channels) {
    for (const byte of new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) h = Math.imul(h ^ byte, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

describe('the seed', () => {
  it('is FNV-1a over the UTF-8 bytes of the id', () => {
    // The standard FNV-1a vectors, and a character of two UTF-8 bytes
    expect(reverbSeedOf('')).toBe(0x811c9dc5)
    expect(reverbSeedOf('a')).toBe(0xe40c292c)
    expect(reverbSeedOf('foobar')).toBe(0xbf9cf968)
    expect(reverbSeedOf('é')).toBe(0x1e9de8c1)
    expect(reverbSeedOf('track001')).toBe(0x792b1af7)
  })
})

describe('the generator', () => {
  it('draws mulberry32 from the seed', () => {
    const next = mulberry32(reverbSeedOf('track001'))
    expect([next(), next(), next(), next()]).toEqual([
      0.09927134145982563, 0.2718899727333337, 0.4748522883746773, 0.18958672368898988,
    ])
  })
})

describe('the impulse response', () => {
  it('is 2.5 s of the draws, faded by (1 - t) squared, channel 0 then channel 1', () => {
    const [left, right] = reverbImpulse(48000, reverbSeedOf('track001'))
    expect(left.length).toBe(120000)
    expect(right.length).toBe(120000)
    expect(Array.from(left.subarray(0, 3))).toEqual([-0.8014573454856873, -0.45621246099472046, -0.05029374733567238])
    expect(hashOf(left, right)).toBe('e5c5f600')
  })

  it('is drawn the same way at 44.1 kHz, over its own length', () => {
    const [left, right] = reverbImpulse(44100, reverbSeedOf('track001'))
    expect(left.length).toBe(110250)
    expect(Array.from(left.subarray(0, 3))).toEqual([-0.8014573454856873, -0.45621177554130554, -0.05029359832406044])
    expect(hashOf(left, right)).toBe('5ddcb6bb')
  })
})

describe('the engine', () => {
  afterEach(() => vi.restoreAllMocks())

  const track = (id: string): Track => ({ id, name: id, presetId: 'strings', notes: [] })
  const state = (ids: string[]): SoundscapeState => ({
    metadata: { name: 'Reverb', tempo: 120, timeSignature: [4, 4], lengthBeats: 4 },
    presets: [...builtInPresets],
    tracks: ids.map(track),
    mixer: { tracks: Object.fromEntries(ids.map((id) => [id, { volume: 1, mute: false, solo: false }])), masterVolume: 1 },
  })

  /** Load the state in an engine of its own, and read each track's impulse response. */
  async function impulses(ids: string[], rate = 48000): Promise<Record<string, string>> {
    const engine = new AudioEngine({ context: new OfflineAudioContext(2, 128, rate) as unknown as BaseAudioContext })
    await engine.initialize()
    engine.updateState(state(ids))
    const channels = (engine as unknown as { trackChannels: Map<string, { effectsChain: { convolverNode: ConvolverNode } }> })
      .trackChannels
    return Object.fromEntries(
      ids.map((id) => {
        const buffer = channels.get(id)!.effectsChain.convolverNode.buffer!
        return [id, hashOf(buffer.getChannelData(0), buffer.getChannelData(1))]
      })
    )
  }

  it('draws nothing from Math.random', async () => {
    const random = vi.spyOn(Math, 'random')
    await impulses(['track001'])
    expect(random).not.toHaveBeenCalled()
  })

  it("gives a track its seed's impulse response, the same on every load", async () => {
    const [left, right] = reverbImpulse(48000, reverbSeedOf('track001'))
    expect(await impulses(['track001'])).toEqual({ track001: hashOf(left, right) })
    expect(await impulses(['track001'])).toEqual({ track001: hashOf(left, right) })
  })

  it('gives two tracks different ones, and adding a track changes no other', async () => {
    const two = await impulses(['track001', 'track002'])
    expect(two.track001).not.toBe(two.track002)
    const three = await impulses(['track000', 'track001', 'track002'])
    expect(three.track001).toBe(two.track001)
    expect(three.track002).toBe(two.track002)
  })
})
