import { describe, it, expect } from 'vitest'
import { createMidiRecorder } from '../midiRecorder'

const GRID = 0.25 // 1/16 at 4/4

describe('createMidiRecorder', () => {
  it('captures a note quantized to the grid', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(60, 100, 1.13) // ~beat 1.25
    rec.noteOff(60, 2.02) // ~beat 2 -> duration ~0.75
    const notes = rec.finish(4)
    expect(notes).toEqual([{ pitch: 60, startTime: 1.25, duration: 0.75, velocity: 100 }])
  })

  it('enforces a minimum duration of one grid step', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(60, 100, 2.0)
    rec.noteOff(60, 2.05) // a very short tap
    expect(rec.finish(4)).toEqual([{ pitch: 60, startTime: 2, duration: 0.25, velocity: 100 }])
  })

  it('closes still-held notes at the finish beat', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(60, 90, 0)
    rec.noteOn(64, 80, 1)
    const notes = rec.finish(3)
    expect(notes).toEqual([
      { pitch: 60, startTime: 0, duration: 3, velocity: 90 },
      { pitch: 64, startTime: 1, duration: 2, velocity: 80 },
    ])
  })

  it('clamps a note held across the loop wrap at the loop end', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(60, 100, 15)
    rec.noteOff(60, 1.5) // beat wrapped: 1.5 < 15
    expect(rec.finish(4)).toEqual([{ pitch: 60, startTime: 15, duration: 1, velocity: 100 }])
  })

  it('a re-struck pitch closes the previous note at the restrike beat', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(60, 100, 0)
    rec.noteOn(60, 110, 2) // restrike
    rec.noteOff(60, 3)
    expect(rec.finish(4)).toEqual([
      { pitch: 60, startTime: 0, duration: 2, velocity: 100 },
      { pitch: 60, startTime: 2, duration: 1, velocity: 110 },
    ])
  })

  it('clamps a start quantized to the loop end back into range', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(60, 100, 15.95) // rounds to 16 == loop end
    rec.noteOff(60, 15.99)
    expect(rec.finish(4)).toEqual([{ pitch: 60, startTime: 15.75, duration: 0.25, velocity: 100 }])
  })

  it('noteOff for an unknown pitch is ignored', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOff(60, 1)
    expect(rec.finish(4)).toEqual([])
  })

  it('returns notes sorted by start time', () => {
    const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
    rec.noteOn(64, 100, 2)
    rec.noteOff(64, 3)
    rec.noteOn(60, 100, 0.5)
    rec.noteOff(60, 1)
    const notes = rec.finish(4)
    expect(notes.map((n) => n.startTime)).toEqual([0.5, 2])
  })

  describe('snapshot', () => {
    it('includes closed notes and held notes grown to the current beat', () => {
      const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
      rec.noteOn(60, 100, 0)
      rec.noteOff(60, 1)
      rec.noteOn(64, 80, 2) // still held

      expect(rec.snapshot(3)).toEqual([
        { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
        { pitch: 64, startTime: 2, duration: 1, velocity: 80 },
      ])
    })

    it('grows a held note as the beat advances', () => {
      const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
      rec.noteOn(60, 100, 1)

      expect(rec.snapshot(1.5)[0]?.duration).toBe(0.5)
      expect(rec.snapshot(3)[0]?.duration).toBe(2)
    })

    it('does not mutate the recording', () => {
      const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
      rec.noteOn(60, 100, 0)
      rec.noteOff(60, 1)
      rec.noteOn(64, 80, 2)

      rec.snapshot(3)
      rec.snapshot(4)

      // finish() must behave exactly as if snapshot() had never been called
      expect(rec.finish(5)).toEqual([
        { pitch: 60, startTime: 0, duration: 1, velocity: 100 },
        { pitch: 64, startTime: 2, duration: 3, velocity: 80 },
      ])
    })

    it('is empty before anything is played', () => {
      const rec = createMidiRecorder({ grid: GRID, loopLengthBeats: 16 })
      expect(rec.snapshot(2)).toEqual([])
    })
  })
})
