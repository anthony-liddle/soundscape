/**
 * The reverb's impulse response: noise from a seeded generator, so a track's
 * reverb comes out the same on every load, and the same in any engine that
 * follows this to the bit. Each track's chain is seeded from the track's id,
 * so every track has a draw of its own, and adding a track changes no other's.
 *
 * Specified exactly, since another implementation must reproduce it bit for
 * bit:
 *
 * 1. The seed: FNV-1a, 32-bit, over the UTF-8 bytes of the track's id. Start
 *    at 0x811C9DC5; for each byte, XOR it in, then multiply by 0x01000193,
 *    modulo 2^32. A chain made with no seed takes the empty id's, 0x811C9DC5.
 * 2. The generator: mulberry32, from that seed. Each draw adds 0x6D2B79F5 to a
 *    32-bit state, modulo 2^32, then mixes a copy of it: t = (t XOR (t >>> 15))
 *    times (t OR 1); then t = t XOR (t + (t XOR (t >>> 7)) times (t OR 61));
 *    then (t XOR (t >>> 14)) as an unsigned 32-bit integer, over 2^32, a draw
 *    in [0, 1). Every multiply keeps the low 32 bits, as Math.imul does.
 * 3. The shape: two channels of floor(sampleRate * 2.5) frames each, channel 0
 *    first, then channel 1, from one stream of draws. Frame i of a channel of
 *    n frames is (r * 2 - 1) * fade, where r is the next draw and fade is
 *    (1 - t) * (1 - t) with t = i / n, all in double, then stored as float32,
 *    rounding to the nearest.
 *
 * The ConvolverNode keeps normalize at its default, true.
 */

/** The impulse response's length, in seconds. */
export const REVERB_SECONDS = 2.5;

/** The seed of a track's reverb: FNV-1a, 32-bit, over the UTF-8 bytes of its id. */
export function reverbSeedOf(trackId: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(trackId)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}

/** mulberry32: each call returns the next draw in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The impulse response's two channels at `sampleRate`, drawn from `seed`. */
export function reverbImpulse(sampleRate: number, seed: number): [Float32Array, Float32Array] {
  const length = Math.floor(sampleRate * REVERB_SECONDS);
  const next = mulberry32(seed);
  const channels: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  for (const data of channels) {
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const fade = (1 - t) * (1 - t);
      data[i] = (next() * 2 - 1) * fade;
    }
  }
  return channels;
}
