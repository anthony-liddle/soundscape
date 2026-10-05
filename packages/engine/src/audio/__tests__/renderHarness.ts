import { vi } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'

/**
 * Shared machinery for rendering the engine offline in node-web-audio-api and
 * comparing the result with a reference recorded earlier.
 *
 * Renders run at 48 kHz, where 8 ms is exactly 384 frames, three render
 * quanta. That lets a render be driven in steps that keep the fake timer clock
 * and the audio clock in lockstep: at every step the render suspends, the fake
 * clock advances by the same 8 ms, and any timer that falls due fires while
 * `currentTime` reads the moment it would have read in a browser.
 *
 * Every source starts at START, never at 0: node-web-audio-api's first render
 * quanta can hold garbage (see render.test.ts), so comparisons begin there.
 */
export const SAMPLE_RATE = 48000
export const STEP_SECONDS = 0.008
export const START = 0.128

/** A deterministic stand-in for Math.random, so the reverb impulse response repeats. */
export function seedRandom(seed = 1): void {
  let state = seed >>> 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
}

/**
 * Make `new AudioContext()` construct an offline context of the given length,
 * and return a getter for the one constructed. The worklet is refused
 * explicitly, so the engine always takes its setInterval scheduler here.
 */
export function installOfflineAudioContext(seconds: number): () => OfflineAudioContext {
  let made: OfflineAudioContext | null = null
  class Offline extends OfflineAudioContext {
    constructor() {
      super(1, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE)
      // Shadow addModule on this context's own worklet rather than replacing
      // the worklet: node-web-audio-api's rendering reads the worklet itself.
      Object.defineProperty(this.audioWorklet, 'addModule', {
        value: () => Promise.reject(new Error('no worklet in offline renders')),
      })
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      made = this
    }
  }
  vi.stubGlobal('AudioContext', Offline)
  return () => {
    if (!made) throw new Error('No AudioContext was constructed')
    return made
  }
}

/** Fake only the timers the engine uses, never setImmediate. */
export function useLockstepTimers(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
}

/**
 * Render `ctx`, stepping the fake clock with it. `at` maps a step's time to
 * work to do there, after the timers due by then have fired.
 */
export async function renderInLockstep(
  ctx: OfflineAudioContext,
  at: Map<number, () => void> = new Map()
): Promise<Float32Array> {
  const frames = ctx.length
  const step = Math.round(STEP_SECONDS * SAMPLE_RATE)
  for (let frame = step; frame < frames; frame += step) {
    const time = frame / SAMPLE_RATE
    void ctx.suspend(time).then(() => {
      vi.advanceTimersByTime(STEP_SECONDS * 1000)
      for (const [when, work] of at) if (Math.round(when * SAMPLE_RATE) === frame) work()
      void ctx.resume()
    })
  }
  const buffer = await ctx.startRendering()
  return buffer.getChannelData(0)
}

/** Largest absolute sample difference from `fromSeconds` on. */
export function largestDifference(a: Float32Array, b: Float32Array, fromSeconds = START): number {
  let largest = 0
  for (let i = Math.round(fromSeconds * SAMPLE_RATE); i < Math.max(a.length, b.length); i++) {
    largest = Math.max(largest, Math.abs((a[i] ?? 0) - (b[i] ?? 0)))
  }
  return largest
}

/** A mono WAV of 32-bit float samples, so a reference is the render exactly. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const out = new Uint8Array(58 + samples.length * 4)
  const view = new DataView(out.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 50 + samples.length * 4, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 18, true)
  view.setUint16(20, 3, true) // IEEE float
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 32, true)
  view.setUint16(36, 0, true)
  ascii(38, 'fact')
  view.setUint32(42, 4, true)
  view.setUint32(46, samples.length, true)
  ascii(50, 'data')
  view.setUint32(54, samples.length * 4, true)
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.length * 4), 58)
  return out
}

export function decodeWav(wav: Uint8Array): Float32Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || view.getUint16(20, true) !== 3) {
    throw new Error('Not a float WAV written by encodeWav')
  }
  const bytes = view.getUint32(54, true)
  const samples = new Float32Array(bytes / 4)
  new Uint8Array(samples.buffer).set(wav.subarray(58, 58 + bytes))
  return samples
}
