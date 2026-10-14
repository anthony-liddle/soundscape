// Records what Chromium's own WaveShaperNode makes of one known input, for the
// Swift package's DistortionTests to hold its waveshaper to sample by sample:
// the engine's curve at a low and the full amount, oversampled 2x, as a cue
// chain distorts. measure() reads a whole cue, where a missing anti-aliasing
// filter can hide under the rest of the sound; this cannot.
//
//   node conformance/cues/render/waveshaper.mjs
//
// The input is a band-limited square at 1 kHz, 0.8 high, its odd harmonics up
// to 19 kHz, so the curve makes harmonics far past Nyquist: 2048 frames at
// 48 kHz, faded in over 64. Input and outputs are stored as float32 bytes,
// little-endian, in base64. CI does not run this; rerun it on purpose.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(`${root}packages/engine/package.json`);
const { chromium } = require('playwright');

const RATE = 48000;
const FRAMES = 2048;
const AMOUNTS = [0.1, 1];

const input = new Float32Array(FRAMES);
for (let i = 0; i < FRAMES; i++) {
  let v = 0;
  for (let h = 1; h * 1000 < 20000; h += 2) v += Math.sin((2 * Math.PI * 1000 * h * i) / RATE) / h;
  input[i] = ((0.8 * 4) / Math.PI) * v * Math.min(1, i / 64);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const outputs = {};
  for (const amount of AMOUNTS) {
    const out = await page.evaluate(
      async ({ input, amount, rate }) => {
        const context = new OfflineAudioContext(1, input.length, rate);
        const buffer = context.createBuffer(1, input.length, rate);
        buffer.copyToChannel(Float32Array.from(input), 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        // makeDistortionCurve, as the engine makes it
        const samples = 44101;
        const curve = new Float32Array(samples);
        const k = amount * 100;
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / (samples - 1) - 1;
          curve[i] = (x * (Math.PI + k)) / (Math.PI + k * Math.abs(x));
        }
        const shaper = context.createWaveShaper();
        shaper.curve = curve;
        shaper.oversample = '2x';
        source.connect(shaper).connect(context.destination);
        source.start(0);
        return Array.from((await context.startRendering()).getChannelData(0));
      },
      { input: Array.from(input), amount, rate: RATE },
    );
    outputs[amount] = Buffer.from(Float32Array.from(out).buffer).toString('base64');
  }
  const file = {
    about:
      "What Chromium's WaveShaperNode makes of one input: the engine's distortion curve at each amount, oversampled 2x, rendered offline from frame 0. Written by waveshaper.mjs; input and outputs are float32, little-endian, in base64.",
    playwright: require('playwright/package.json').version,
    chromium: browser.version(),
    rate: RATE,
    input: Buffer.from(input.buffer).toString('base64'),
    outputs,
  };
  writeFileSync(new URL('references/waveshaper-chromium.json', import.meta.url), JSON.stringify(file, null, 2) + '\n');
  console.log(`wrote references/waveshaper-chromium.json, Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
