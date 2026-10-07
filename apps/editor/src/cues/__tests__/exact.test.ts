import { describe, it, expect } from 'vitest'
import { secondsAsMs, msAsSeconds, parseNumber, nudge } from '../exact'

/**
 * Start and duration are edited in milliseconds, but stored in seconds. The
 * conversion moves the decimal point in the text rather than multiplying, so
 * every stored double comes back as itself: shown, then read back untouched.
 */

// Every distinct start and duration in Peach of a Word's cue file, as written there
const PEACH = [
  0, 0.04, 0.08, 0.09, 0.1, 0.13, 0.2, 0.30000000000000004, 0.4, 0.5,
  0.03, 0.12, 0.16, 0.18, 0.28, 1.1,
]

describe('milliseconds, by moving the decimal point', () => {
  it.each([
    [0.04, '40'],
    [0.30000000000000004, '300.00000000000004'],
    [1.1, '1100'],
    [0, '0'],
    [0.0001, '0.1'],
    [5e-7, '0.0005'],
    [1.5e-10, '1.5e-7'],
    [123.456, '123456'],
  ])('shows %s s as %s ms', (seconds, ms) => {
    expect(secondsAsMs(seconds)).toBe(ms)
  })

  it.each([
    ['40', 0.04],
    ['300.00000000000004', 0.30000000000000004],
    ['40.1', 0.0401],
    ['.5', 0.0005],
    ['40.', 0.04],
    ['4e1', 0.04],
    [' 41 ', 0.041],
    ['1.5e-7', 1.5e-10],
    ['0', 0],
  ])('reads %s ms as %s s', (ms, seconds) => {
    expect(msAsSeconds(ms)).toBe(seconds)
  })

  it('reads typed milliseconds as the double the same decimal in seconds would be, not 40.1 / 1000', () => {
    // Division rounds twice: 40.1 / 1000 is 0.040100000000000004
    expect(40.1 / 1000).not.toBe(0.0401)
    expect(msAsSeconds('40.1')).toBe(0.0401)
  })

  it.each(PEACH)('gives back %s s, bit for bit, after showing it in milliseconds', (seconds) => {
    expect(Object.is(msAsSeconds(secondsAsMs(seconds)), seconds)).toBe(true)
  })

  it('gives back any double, bit for bit, from 1e-12 s to 1000 s', () => {
    // A fixed-seed generator, so a failure names the same value every run
    let seed = 1
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const misses: number[] = []
    for (let i = 0; i < 20000; i++) {
      const seconds = random() * 10 ** Math.floor(random() * 16 - 12)
      if (!Object.is(msAsSeconds(secondsAsMs(seconds)), seconds)) misses.push(seconds)
    }
    expect(misses).toEqual([])
  })

  it('refuses text that is not a finite number', () => {
    for (const text of ['', '  ', 'abc', '1e400', 'NaN', '4 0']) expect(msAsSeconds(text)).toBeNull()
  })
})

describe('reading a typed number', () => {
  it('reads what Number reads, and refuses empty and non-finite text', () => {
    expect(parseNumber('0.25')).toBe(0.25)
    expect(parseNumber(' -3 ')).toBe(-3)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('Infinity')).toBeNull()
    expect(parseNumber('twelve')).toBeNull()
  })
})

describe('nudging', () => {
  it('rounds to the step, so 0.04 + 0.001 is 0.041', () => {
    expect(nudge(0.04, 0.001, 1)).toBe(0.041)
    expect(nudge(0.07418053232275866, 0.01, 1)).toBe(0.08)
    expect(nudge(0.07418053232275866, 0.01, -1)).toBe(0.06)
    // 0.1 * 3 is 0.30000000000000004, and in milliseconds 300.00000000000006
    expect(nudge(0.1 * 3 * 1000, 1, 1)).toBe(301)
    expect(nudge(40, 10, -1)).toBe(30)
  })
})
