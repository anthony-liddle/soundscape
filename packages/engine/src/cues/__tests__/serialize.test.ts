import { describe, expect, it } from 'vitest'
import { parseCueDocument } from '../validate'
import { serializeCueDocument } from '../serialize'
import type { CueDocument } from '../types'

/**
 * Saving an unchanged cue document reproduces its bytes exactly, whatever
 * order its keys were built in, so an editor's save shows up in a diff only
 * where something actually changed.
 */
const instrument = {
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0.07418049391491698,
  decay: 0.21368861278826287,
  sustain: 0,
  release: 0,
  envelopeCurve: 'exponential',
  envelopeFloor: 0.000018,
  filterType: 'none',
  filterCutoff: 1,
  filterResonance: 0,
  delayTime: 0,
  delayFeedback: 0,
  delayMix: 0,
  distortion: 0,
  reverbMix: 0,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  unisonDetune: 0,
  velocityResponse: 0,
} as const

const doc: CueDocument = {
  format: 'soundscape-cues',
  version: 1,
  instruments: { sine: { ...instrument }, 'a-first': { ...instrument, waveform: 'square' } },
  cues: {
    zap: { notes: [{ id: 'z2', instrument: 'sine', start: 0.04, duration: 0.12, pitch: 97.01955000865388, level: 0.018 }] },
    blip: {
      notes: [
        { id: 'b2', instrument: 'sine', start: 0.1, duration: 0.2, pitch: 79.5, level: 0.5 },
        { id: 'b1', instrument: 'a-first', start: 0, duration: 0.03, pitch: 81, level: 0.0216 },
      ],
    },
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** The same document, every object's keys in reverse order. */
function shuffled(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffled)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, shuffled(v)]))
  }
  return value
}

describe('serializeCueDocument', () => {
  it('writes the same bytes again when nothing has changed', () => {
    const text = serializeCueDocument(doc)
    const read = parseCueDocument(text)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(serializeCueDocument(read.document)).toBe(text)
  })

  it('reads back as the same document, every number to the last bit', () => {
    const read = parseCueDocument(serializeCueDocument(doc))
    expect(read.ok && read.document).toEqual(doc)
  })

  it('does not depend on the order keys were built in', () => {
    expect(serializeCueDocument(shuffled(doc) as CueDocument)).toBe(serializeCueDocument(doc))
  })

  it('sorts instruments and cues by name, and keeps notes in the order given', () => {
    const text = serializeCueDocument(doc)
    expect(text.indexOf('"a-first"')).toBeLessThan(text.indexOf('"sine"'))
    expect(text.indexOf('"blip"')).toBeLessThan(text.indexOf('"zap"'))
    expect(text.indexOf('"b2"')).toBeLessThan(text.indexOf('"b1"'))
  })

  it('writes decayUntilRelease where the decay would be, whatever order it was built in', () => {
    const fading = Object.fromEntries(Object.entries(instrument).filter(([key]) => key !== 'decay'))
    const untilRelease = { ...doc, instruments: { sine: { ...fading, decayUntilRelease: true } } } as unknown as CueDocument
    const text = serializeCueDocument(untilRelease)
    const keys = Object.keys((JSON.parse(text) as Loose).instruments.sine)
    expect(keys.slice(0, 5)).toEqual(['waveform', 'pitchOffset', 'attack', 'decayUntilRelease', 'sustain'])
    expect(keys).not.toContain('decay')
    expect(serializeCueDocument(shuffled(untilRelease) as CueDocument)).toBe(text)
  })

  it('ends with a newline and writes -0 as 0', () => {
    const negativeZero = { ...doc, cues: { blip: { notes: [{ ...doc.cues.blip!.notes[1]!, start: -0 }] } } }
    const text = serializeCueDocument(negativeZero)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('"start": 0,')
  })
})
