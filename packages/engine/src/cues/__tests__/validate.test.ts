import { describe, expect, it } from 'vitest'
import { parseCueDocument, validateCueDocument } from '../validate'
import type { CueDocument, CueProblem } from '../types'

/**
 * The cue validator is stricter than the state validator, on purpose. Each
 * rule rejects, never repairs, and names the path to the bad value.
 */
function valid(): CueDocument {
  return {
    format: 'soundscape-cues',
    version: 1,
    instruments: {
      square: {
        waveform: 'square',
        pitchOffset: 0,
        attack: 0.07418049,
        decay: 0.05172575,
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
      },
    },
    cues: {
      tick: {
        notes: [{ id: 'tick-1', instrument: 'square', start: 0, duration: 0.03, pitch: 81, level: 0.0216 }],
      },
    },
  }
}

// These tests break documents on purpose, so they edit them through an untyped view.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** A valid document with one change made to it. */
function withChange(change: (doc: Loose) => void): unknown {
  const doc = valid() as unknown as Loose
  change(doc)
  return doc
}

function problems(value: unknown): CueProblem[] {
  const result = validateCueDocument(value)
  return result.ok ? [] : result.problems
}

const paths = (value: unknown) => problems(value).map((p) => p.path)

describe('a valid cue document', () => {
  it('is accepted, and comes back as the document', () => {
    const result = validateCueDocument(valid())
    expect(result).toEqual({ ok: true, document: valid() })
  })
})

describe('rule: unknown keys are rejected anywhere', () => {
  it('at the top', () => {
    expect(paths(withChange((d) => (d.extra = 1)))).toEqual(['extra'])
  })
  it('in an instrument', () => {
    expect(paths(withChange((d) => (d.instruments.square.volume = 1)))).toEqual(['instruments.square.volume'])
  })
  it('in a cue', () => {
    expect(paths(withChange((d) => (d.cues.tick.loop = true)))).toEqual(['cues.tick.loop'])
  })
  it('in a note', () => {
    expect(paths(withChange((d) => (d.cues.tick.notes[0].velocity = 100)))).toEqual(['cues.tick.notes[0].velocity'])
  })
})

describe('rule: required keys must be present', () => {
  it('names each missing key', () => {
    expect(paths(withChange((d) => delete d.cues.tick.notes[0].level))).toEqual(['cues.tick.notes[0].level'])
    expect(paths(withChange((d) => delete d.instruments.square.reverbMix))).toEqual(['instruments.square.reverbMix'])
    expect(paths(withChange((d) => delete d.instruments))).toEqual(['instruments'])
  })
})

describe('rule: numbers must be finite and in range', () => {
  const cases: [string, (d: Loose) => void, string][] = [
    ['NaN level', (d) => (d.cues.tick.notes[0].level = Number.NaN), 'cues.tick.notes[0].level'],
    ['infinite start', (d) => (d.cues.tick.notes[0].start = Number.POSITIVE_INFINITY), 'cues.tick.notes[0].start'],
    ['a level of 0', (d) => (d.cues.tick.notes[0].level = 0), 'cues.tick.notes[0].level'],
    ['a level above 1', (d) => (d.cues.tick.notes[0].level = 1.5), 'cues.tick.notes[0].level'],
    ['a level at or under the floor', (d) => (d.cues.tick.notes[0].level = 0.000018), 'cues.tick.notes[0].level'],
    ['a negative start', (d) => (d.cues.tick.notes[0].start = -0.01), 'cues.tick.notes[0].start'],
    ['a zero duration', (d) => (d.cues.tick.notes[0].duration = 0), 'cues.tick.notes[0].duration'],
    ['a pitch over 127', (d) => (d.cues.tick.notes[0].pitch = 127.5), 'cues.tick.notes[0].pitch'],
    ['a normalized value over 1', (d) => (d.instruments.square.attack = 1.2), 'instruments.square.attack'],
    ['a pitch offset past two octaves', (d) => (d.instruments.square.pitchOffset = 25), 'instruments.square.pitchOffset'],
    ['a floor of 1', (d) => (d.instruments.square.envelopeFloor = 1), 'instruments.square.envelopeFloor'],
    ['a string for a number', (d) => (d.cues.tick.notes[0].pitch = '81'), 'cues.tick.notes[0].pitch'],
  ]
  for (const [name, change, path] of cases) {
    it(name, () => expect(paths(withChange(change))).toContain(path))
  }

  it('reverb and velocity response must be 0 in a cue instrument', () => {
    expect(paths(withChange((d) => (d.instruments.square.reverbMix = 0.2)))).toEqual(['instruments.square.reverbMix'])
    expect(paths(withChange((d) => (d.instruments.square.velocityResponse = 0.5)))).toEqual([
      'instruments.square.velocityResponse',
    ])
  })

  it('applies the instrument rules the state validator does', () => {
    expect(paths(withChange((d) => delete d.instruments.square.envelopeFloor))).toEqual(['instruments.square.envelopeFloor'])
    expect(paths(withChange((d) => (d.instruments.square.envelopeCurve = 'linear')))).toEqual([
      'instruments.square.envelopeFloor',
    ])
    expect(paths(withChange((d) => Object.assign(d.instruments.square, { lfoDepth: 0.2, lfoTarget: 'filter' })))).toEqual([
      'instruments.square.lfoTarget',
    ])
    expect(paths(withChange((d) => (d.instruments.square.waveform = 'noise')))).toEqual(['instruments.square.waveform'])
  })
})

describe("rule: an instrument's decay is a fixed length or lasts until each note's release, never both", () => {
  /** The valid document's instrument, its decay lasting until each note's release instead. */
  const untilRelease = (d: Loose) => {
    delete d.instruments.square.decay
    d.instruments.square.decayUntilRelease = true
  }

  it('accepts decayUntilRelease: true in place of decay', () => {
    expect(problems(withChange(untilRelease))).toEqual([])
  })

  it('rejects a decay beside it, at the decay, whose value nothing would read', () => {
    const both = withChange((d) => {
      untilRelease(d)
      d.instruments.square.decay = 0.05172575
    })
    expect(problems(both)).toEqual([
      {
        path: 'instruments.square.decay',
        message: "must be left out: decayUntilRelease makes the decay last until each note's release",
      },
    ])
  })

  for (const value of [false, 1, 'true', null]) {
    it(`rejects decayUntilRelease: ${JSON.stringify(value)}, since only true means anything`, () => {
      expect(problems(withChange((d) => (d.instruments.square.decayUntilRelease = value)))).toEqual([
        {
          path: 'instruments.square.decayUntilRelease',
          message: 'must be true, or left out for a decay of fixed length',
        },
      ])
    })
  }

  it('names the decay when there is neither, and the field that could stand in for it', () => {
    expect(problems(withChange((d) => delete d.instruments.square.decay))).toEqual([
      { path: 'instruments.square.decay', message: 'is required, unless decayUntilRelease is true' },
    ])
  })
})

describe('rule: a note may only use an instrument the document defines', () => {
  it('rejects an undefined instrument', () => {
    expect(paths(withChange((d) => (d.cues.tick.notes[0].instrument = 'sine')))).toEqual(['cues.tick.notes[0].instrument'])
  })
  it('does not find one on Object.prototype', () => {
    expect(paths(withChange((d) => (d.cues.tick.notes[0].instrument = 'toString')))).toEqual([
      'cues.tick.notes[0].instrument',
    ])
  })
})

describe('rule: names and ids are well formed and unique', () => {
  it('rejects a duplicate note id, anywhere in the document', () => {
    const doc = withChange((d) => {
      d.cues.tock = { notes: [{ ...d.cues.tick.notes[0] }] }
    })
    expect(paths(doc)).toEqual(['cues.tock.notes[0].id'])
  })
  it('rejects a duplicate cue or instrument name in the JSON text, which JSON.parse would hide', () => {
    const text = JSON.stringify(valid(), null, 2)
    const twoTicks = text.replace('"cues": {', '"cues": {\n    "tick": { "notes": [] },')
    const twoSquares = text.replace('"instruments": {', '"instruments": {\n    "square": {},')
    const result = (t: string) => {
      const r = parseCueDocument(t)
      return r.ok ? [] : r.problems.map((p) => p.path)
    }
    expect(result(twoTicks)).toContain('cues.tick')
    expect(result(twoSquares)).toContain('instruments.square')
  })
  it('rejects a name or id outside letters, digits, dash and underscore', () => {
    expect(paths(withChange((d) => (d.cues['two words'] = { notes: [] })))).toContain('cues.two words')
    expect(paths(withChange((d) => (d.cues.tick.notes[0].id = '')))).toContain('cues.tick.notes[0].id')
    const proto = JSON.parse(JSON.stringify(valid()).replace('"tick":', '"__proto__":'))
    expect(paths(proto)).toContain('cues.__proto__')
  })
})

describe('rule: the format and version must be ones this engine reads', () => {
  it('rejects an unsupported version', () => {
    expect(paths(withChange((d) => (d.version = 2)))).toEqual(['version'])
  })
  it('rejects something that is not a cue document', () => {
    expect(paths(withChange((d) => (d.format = 'soundscape')))).toEqual(['format'])
    expect(paths(null)).toEqual([''])
    const notJson = parseCueDocument('{ "format": ')
    expect(notJson.ok ? [] : notJson.problems.map((p) => p.path)).toEqual([''])
  })
})

describe('every problem is reported, not just the first', () => {
  it('collects them all', () => {
    const doc = withChange((d) => {
      d.version = 2
      d.cues.tick.notes[0].level = 2
      d.cues.tick.notes[0].instrument = 'missing'
    })
    expect(paths(doc).sort()).toEqual(['cues.tick.notes[0].instrument', 'cues.tick.notes[0].level', 'version'])
  })
})
