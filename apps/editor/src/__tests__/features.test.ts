import { describe, it, expect, afterEach, vi } from 'vitest'
import { cuesViewOn } from '../features'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the Cues view flag', () => {
  it.each([
    [true, undefined, true],
    [true, '', true],
    [false, '1', true],
    [false, '0', false],
    [false, '', false],
    [false, undefined, false],
    [false, 'true', false],
  ])('with DEV %s and VITE_CUES_VIEW %j, is %s', (dev, flag, on) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('VITE_CUES_VIEW', flag)
    expect(cuesViewOn()).toBe(on)
  })
})
