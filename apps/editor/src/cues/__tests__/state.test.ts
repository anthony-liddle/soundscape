import { describe, it, expect } from 'vitest'
import type { CueDocument } from 'soundscape-engine'
import { cueReducer, initialCueEditor, isDirty, MAX_CUE_HISTORY } from '../state'
import type { CueAction, CueEditor } from '../state'

const instrument = {
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0.1,
  decay: 0.2,
  sustain: 0,
  release: 0,
  envelopeCurve: 'linear',
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
  instruments: { sine: instrument },
  cues: {
    blip: {
      notes: [
        { id: 'blip-1', instrument: 'sine', start: 0, duration: 0.1, pitch: 60, level: 0.5 },
        { id: 'blip-2', instrument: 'sine', start: 0.1, duration: 0.1, pitch: 67, level: 0.25 },
      ],
    },
    chime: { notes: [{ id: 'chime-1', instrument: 'sine', start: 0, duration: 0.3, pitch: 72, level: 0.4 }] },
  },
}

const run = (...actions: CueAction[]): CueEditor => actions.reduce(cueReducer, initialCueEditor())
const open: CueAction = { type: 'OPEN', doc, fileName: 'sounds.cues.json' }
const setLevel = (value: number): CueAction => ({ type: 'SET_NOTE', noteId: 'blip-2', field: 'level', value })

describe('the cue editor state', () => {
  it('opens a document with its first cue and first note selected, and nothing to undo', () => {
    const editor = run(open)
    expect(editor.doc).toBe(doc)
    expect([editor.fileName, editor.cue, editor.noteId]).toEqual(['sounds.cues.json', 'blip', 'blip-1'])
    expect([editor.past, editor.future]).toEqual([[], []])
    expect(isDirty(editor)).toBe(false)
  })

  it('records an edit, and is then unsaved', () => {
    const editor = run(open, setLevel(0.3))
    expect(editor.doc!.cues.blip!.notes[1]!.level).toBe(0.3)
    // Nothing else in the document moved
    expect(editor.doc!.cues.blip!.notes[0]).toBe(doc.cues.blip!.notes[0])
    expect(editor.doc!.cues.chime).toBe(doc.cues.chime)
    expect(editor.past).toEqual([doc])
    expect(isDirty(editor)).toBe(true)
  })

  it('leaves the document alone when a value is set to what it already is', () => {
    const editor = run(open, setLevel(0.25))
    expect(editor.doc).toBe(doc)
    expect(editor.past).toEqual([])
  })

  it('undoes to the very document it had, and so is saved again', () => {
    const editor = run(open, setLevel(0.3), { type: 'UNDO' })
    expect(editor.doc).toBe(doc)
    expect(isDirty(editor)).toBe(false)
  })

  it('redoes, and an edit after an undo drops what could be redone', () => {
    const redone = run(open, setLevel(0.3), { type: 'UNDO' }, { type: 'REDO' })
    expect(redone.doc!.cues.blip!.notes[1]!.level).toBe(0.3)
    const branched = run(open, setLevel(0.3), { type: 'UNDO' }, setLevel(0.2))
    expect(branched.future).toEqual([])
  })

  it('is saved once SAVED says so, until the next edit', () => {
    const saved = run(open, setLevel(0.3), { type: 'SAVED' })
    expect(isDirty(saved)).toBe(false)
    expect(isDirty(cueReducer(saved, setLevel(0.2)))).toBe(true)
  })

  it('selects without making a history entry', () => {
    const editor = run(open, { type: 'SELECT_CUE', cue: 'chime' }, { type: 'SELECT_NOTE', noteId: 'blip-2' })
    expect([editor.cue, editor.noteId]).toEqual(['blip', 'blip-2'])
    expect(editor.past).toEqual([])
  })

  it('selects a cue with its first note', () => {
    const editor = run(open, { type: 'SELECT_CUE', cue: 'chime' })
    expect([editor.cue, editor.noteId]).toEqual(['chime', 'chime-1'])
  })

  it('ignores a cue or note that is not in the document', () => {
    const editor = run(open, { type: 'SELECT_CUE', cue: 'toString' }, { type: 'SELECT_NOTE', noteId: 'nope' })
    expect([editor.cue, editor.noteId]).toEqual(['blip', 'blip-1'])
  })

  it(`keeps the last ${MAX_CUE_HISTORY} edits`, () => {
    const edits = Array.from({ length: MAX_CUE_HISTORY + 5 }, (_, i) => setLevel(0.01 * (i + 1)))
    expect(run(open, ...edits).past).toHaveLength(MAX_CUE_HISTORY)
  })
})

describe('adding and removing notes', () => {
  it('adds a copy of a note right after it, with the next free id, and selects it', () => {
    const editor = run(open, { type: 'ADD_NOTE', cue: 'blip', after: 'blip-1' })
    expect(editor.doc!.cues.blip!.notes.map((n) => n.id)).toEqual(['blip-1', 'blip-3', 'blip-2'])
    expect(editor.doc!.cues.blip!.notes[1]).toEqual({ ...doc.cues.blip!.notes[0], id: 'blip-3' })
    expect(editor.noteId).toBe('blip-3')
    expect(editor.past).toEqual([doc])
  })

  it('takes an id no other cue in the document uses either', () => {
    const crowded: CueDocument = {
      ...doc,
      cues: { ...doc.cues, other: { notes: [{ ...doc.cues.chime!.notes[0]!, id: 'blip-3' }] } },
    }
    const editor = run({ type: 'OPEN', doc: crowded, fileName: 'f' }, { type: 'ADD_NOTE', cue: 'blip', after: 'blip-2' })
    expect(editor.doc!.cues.blip!.notes.map((n) => n.id)).toEqual(['blip-1', 'blip-2', 'blip-4'])
  })

  it('removes a note, and selects the one after it, or before it when it was last', () => {
    const middle = run(open, { type: 'REMOVE_NOTE', noteId: 'blip-1' })
    expect(middle.doc!.cues.blip!.notes.map((n) => n.id)).toEqual(['blip-2'])
    expect(middle.noteId).toBe('blip-2')
    const last = run(open, { type: 'SELECT_NOTE', noteId: 'blip-2' }, { type: 'REMOVE_NOTE', noteId: 'blip-2' })
    expect(last.noteId).toBe('blip-1')
  })

  it('can empty a cue, which the format allows, and then adds a note of its own', () => {
    const empty = run(open, { type: 'SELECT_CUE', cue: 'chime' }, { type: 'REMOVE_NOTE', noteId: 'chime-1' })
    expect(empty.doc!.cues.chime!.notes).toEqual([])
    expect([empty.cue, empty.noteId]).toEqual(['chime', null])
    const refilled = cueReducer(empty, { type: 'ADD_NOTE', cue: 'chime', after: null })
    expect(refilled.doc!.cues.chime!.notes).toEqual([
      { id: 'chime-1', instrument: 'sine', start: 0, duration: 0.1, pitch: 69, level: 0.5 },
    ])
  })
})

describe('changing an instrument', () => {
  it('changes several fields as one edit, and leaves out what is set to undefined', () => {
    const editor = run(open, { type: 'SET_INSTRUMENT', name: 'sine', changes: { decay: undefined, decayUntilRelease: true } })
    const sine = editor.doc!.instruments.sine!
    expect('decay' in sine).toBe(false)
    expect(sine.decayUntilRelease).toBe(true)
    expect(editor.past).toEqual([doc])
  })

  it('leaves the document alone when nothing changes', () => {
    const editor = run(open, { type: 'SET_INSTRUMENT', name: 'sine', changes: { attack: 0.1 } })
    expect(editor.doc).toBe(doc)
  })
})
