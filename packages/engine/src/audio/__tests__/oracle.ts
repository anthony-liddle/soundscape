/**
 * The two committed cues as Peach of a Word plays them, in plain Web Audio:
 * one oscillator and one gain per note, every ramp scheduled directly, all
 * through one master gain. It uses no Soundscape code and does not read the
 * cue document. The notes are transcribed from Peach's engine,
 * src/audio/WebAudioEngine.ts at dbe93d1, where note(freq, startOffset,
 * duration, type, peak) schedules exactly what playOracle does below.
 *
 * It is the oracle a cue is held to. A check built from the code under test
 * cannot catch a fault in that code, and the Firefox defect lived in the
 * engine's own release path. Compare a cue only with the oracle rendered in
 * the same renderer, in the same run.
 */
export type OracleCue = 'tick' | 'found-8-mythic-cute'

/** Every cue passes through one master gain at this level. */
const MASTER_GAIN = 0.18
/** gain.setValueAtTime(0.0001, t0), and the decay's target. */
const FLOOR = 0.0001
/** gain.exponentialRampToValueAtTime(peak, t0 + 0.012). */
const ATTACK = 0.012
/** osc.stop(t0 + duration + 0.02). */
const TAIL = 0.02
/** FOUND_NOTES[8 - FOUND_SHORTEST]: G5. */
const G5 = 783.99
/** RUNG_SPARKLE.mythic. */
const SPARKLE = 3

interface OracleNote {
  hz: number
  start: number
  duration: number
  type: OscillatorType
  peak: number
}

export const ORACLE_NOTES: Record<OracleCue, readonly OracleNote[]> = {
  // tick(): note(880, 0, 0.03, 'square', 0.12)
  tick: [{ hz: 880, start: 0, duration: 0.03, type: 'square', peak: 0.12 }],
  // playFound(8, 'mythic') in the cute theme: the note, its octave, the
  // rung's sparkle, the mythic glint, and the cute glint
  'found-8-mythic-cute': [
    { hz: G5, start: 0, duration: 0.28, type: 'sine', peak: 0.9 },
    { hz: G5 * 2, start: 0, duration: 0.18, type: 'sine', peak: 0.18 },
    { hz: G5 * 3, start: 0.04, duration: 0.12, type: 'sine', peak: 0.04 + SPARKLE * 0.02 },
    { hz: G5 * 4, start: 0.09, duration: 0.1, type: 'sine', peak: 0.05 },
    { hz: G5 * 5, start: 0.13, duration: 0.1, type: 'sine', peak: 0.05 },
  ],
}

/** Schedule a cue at `when` on the context's clock, exactly as Peach's note() does. */
export function playOracle(ctx: BaseAudioContext, cue: OracleCue, when: number): void {
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)
  for (const note of ORACLE_NOTES[cue]) {
    const t0 = when + note.start
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.type
    osc.frequency.value = note.hz
    gain.gain.setValueAtTime(FLOOR, t0)
    gain.gain.exponentialRampToValueAtTime(note.peak, t0 + ATTACK)
    gain.gain.exponentialRampToValueAtTime(FLOOR, t0 + note.duration)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + note.duration + TAIL)
  }
}
