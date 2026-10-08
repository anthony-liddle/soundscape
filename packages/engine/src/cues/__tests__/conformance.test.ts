import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCueDocument } from '../validate'
import type { CueProblem } from '../types'

/**
 * Every case in the shared corpus, conformance/cues, through the validator,
 * held to the answer recorded there: the TypeScript half of the corpus, which
 * the Swift library runs too. Recorded answers that no longer match what the
 * validator says fail here, so expected.json cannot fall out of date.
 */
const CORPUS = resolve(__dirname, '../../../../../conformance/cues')
const NOT_JSON = 'is not valid JSON'

type Expected = { ok: true } | { ok: false; problems: CueProblem[] }
const expected = JSON.parse(readFileSync(resolve(CORPUS, 'expected.json'), 'utf8')) as Record<string, Expected>
const cases = readdirSync(resolve(CORPUS, 'cases'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length))
  .sort()

describe('the shared corpus', () => {
  it('records an answer for every case, and only for cases', () => {
    expect(Object.keys(expected).sort()).toEqual(cases)
  })

  it.each(cases)('%s', (name) => {
    const result = parseCueDocument(readFileSync(resolve(CORPUS, 'cases', `${name}.json`), 'utf8'))
    const want = expected[name]!
    if (want.ok) {
      expect(result.ok ? [] : result.problems).toEqual([])
      return
    }
    const problems = result.ok ? [] : result.problems
    if (want.problems[0]?.message === NOT_JSON) {
      // Each JavaScript engine words its JSON.parse errors its own way
      expect(problems).toHaveLength(1)
      expect(problems[0]!.path).toBe('')
      expect(problems[0]!.message.startsWith(NOT_JSON)).toBe(true)
    } else {
      expect(problems).toEqual(want.problems)
    }
  })
})

describe('the corpus numbers', () => {
  type Number_ = { bits: string; string: string }
  const recorded = JSON.parse(readFileSync(resolve(CORPUS, 'numbers.json'), 'utf8')) as Record<string, Number_>

  it('are every number literal in the cases, as JavaScript reads and writes them', () => {
    const found: Record<string, Number_> = {}
    for (const name of cases) {
      try {
        // The reviver's third argument holds each value's source text
        const reviver = (_key: string, value: unknown, context?: { source?: string }) => {
          if (typeof value === 'number' && context?.source !== undefined) {
            const view = new DataView(new ArrayBuffer(8))
            view.setFloat64(0, value)
            found[context.source] = { bits: view.getBigUint64(0).toString(16).padStart(16, '0'), string: String(value) }
          }
          return value
        }
        JSON.parse(readFileSync(resolve(CORPUS, 'cases', `${name}.json`), 'utf8'), reviver as Parameters<typeof JSON.parse>[1])
      } catch {
        // Not JSON: it has no numbers JavaScript reads
      }
    }
    expect(found).toEqual(recorded)
  })
})
