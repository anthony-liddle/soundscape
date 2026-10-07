import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OfflineAudioContext } from 'node-web-audio-api'
import { AudioEngine } from '../AudioEngine'
import { parseCueDocument } from '../../cues/validate'
import { serializeCueDocument } from '../../cues/serialize'
import type { CueDocument } from '../../cues/types'
import { midiToFrequency } from '../../utils/pitch'
import { normalizedToADSR } from '../../utils/time'
import { SAMPLE_RATE, START, decodeWav, largestDifference } from './renderHarness'

/**
 * Two of Peach of a Word's sounds, written as cues in
 * examples/cues/peach.cues.json, held to the game's own engine.
 *
 * The references in reference/peach are that engine rendered in the same
 * renderer, node-web-audio-api; provenance.json says which commit, which file,
 * and how. Comparing across renderers would mean nothing: node-web-audio-api
 * plays the identical game engine 1.27 dB away from Chrome.
 */
const ROOT = resolve(__dirname, '../../../../..')
const TEXT = readFileSync(resolve(ROOT, 'examples/cues/peach.cues.json'), 'utf8')
const parsed = parseCueDocument(TEXT)
const document = (parsed.ok ? parsed.document : null) as CueDocument

/**
 * The game's calls, transcribed from peach-of-a-word src/audio/WebAudioEngine.ts
 * at the commit in reference/peach/provenance.json. Each note is
 * note(freq, startOffset, duration, type, peak), which schedules
 *   gain 0.0001 at t0, exponential to peak at t0 + 0.012,
 *   exponential to 0.0001 at t0 + duration, stop at t0 + duration + 0.02,
 * all through a master gain of 0.18.
 */
const MASTER_GAIN = 0.18
const FLOOR = 0.0001
const G5 = 783.99 // FOUND_NOTES[8 - FOUND_SHORTEST]
const SPARKLE = 3 // RUNG_SPARKLE.mythic
type GameNote = [freq: number, start: number, duration: number, waveform: string, peak: number]
const GAME: Record<string, GameNote[]> = {
  // tick(): note(880, 0, 0.03, 'square', 0.12)
  tick: [[880, 0, 0.03, 'square', 0.12]],
  // playFound(8, 'mythic') in the cute theme
  'found-8-mythic-cute': [
    [G5, 0, 0.28, 'sine', 0.9],
    [G5 * 2, 0, 0.18, 'sine', 0.18],
    [G5 * 3, 0.04, 0.12, 'sine', 0.04 + SPARKLE * 0.02],
    [G5 * 4, 0.09, 0.1, 'sine', 0.05],
    [G5 * 5, 0.13, 0.1, 'sine', 0.05],
  ],
}

describe("Peach of a Word's sounds as cues", () => {
  it('is a valid document, saved in its canonical form', () => {
    expect(parsed.ok).toBe(true)
    expect(serializeCueDocument(document)).toBe(TEXT)
  })

  for (const [name, notes] of Object.entries(GAME)) {
    it(`${name}: every value is the game's own`, () => {
      const cue = document.cues[name]!
      expect(cue.notes).toHaveLength(notes.length)
      cue.notes.forEach((note, i) => {
        const [freq, start, duration, waveform, peak] = notes[i]!
        const instrument = document.instruments[note.instrument]!
        // The oscillator's frequency param is float32, so that is where the
        // pitch has to land on the game's frequency
        expect(Math.fround(midiToFrequency(note.pitch))).toBe(Math.fround(freq))
        expect(note.start).toBe(start)
        expect(note.duration).toBe(duration)
        expect(note.level).toBe(peak * MASTER_GAIN)
        expect(instrument.waveform).toBe(waveform)
        expect(instrument.envelopeCurve).toBe('exponential')
        expect(instrument.envelopeFloor).toBe(FLOOR * MASTER_GAIN)
        expect(instrument.filterType).toBe('none')
        // The attack reaches its peak at 12 ms, to within the last bit or two
        // of a double, and the decay its floor at the note's release, which is
        // its duration: one instrument serves every length
        const attack = normalizedToADSR(instrument.attack, 'attack')
        expect(Math.abs(attack - 0.012)).toBeLessThan(1e-15)
        expect(instrument.decayUntilRelease).toBe(true)
        // Release plus the voice's 10 ms margin is the game's 20 ms tail
        expect(normalizedToADSR(instrument.release, 'release') + 0.01).toBe(0.02)
      })
    })

    it(`${name}: renders as the game's engine does, sample for sample`, async () => {
      const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
      const engine = new AudioEngine({ context: ctx as unknown as BaseAudioContext })
      await engine.initialize()
      engine.loadCues(document)
      engine.playCue(name, START)
      const cue = Float32Array.from((await ctx.startRendering()).getChannelData(0))
      const game = decodeWav(readFileSync(resolve(__dirname, `reference/peach/${name}.wav`)))
      const lastSound = (x: Float32Array) => x.findLastIndex((v) => v !== 0)
      // 1e-6 for platforms other than the one that recorded the reference;
      // here the two differ by under 3e-8
      expect(largestDifference(cue, game)).toBeLessThan(1e-6)
      expect(lastSound(cue)).toBe(lastSound(game))
    })
  }
})
