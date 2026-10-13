// Records a window of what Chromium renders for two cues through a delay with
// no feedback at a delay between frames, for the Swift package's DelayTests to
// hold its delay to sample by sample where measure() cannot see it.
//
//   node conformance/cues/render/delay-wake.mjs
//
// On arm64 Chromium works out where to read the delay line in float, so the
// read's fraction depends on how far the write index has come, which moves
// only in the quanta the delay processes. Before a cue played late, the delay
// processes while anything in the chain sounds, and a voice's biquad, in its
// path or left connected when the engine routes around it, sounds silence for
// its tail time from the context's first quantum. Get that count of quanta
// wrong by one and these windows come out up to 2.8e-4 off.
//
// Each cue is a 2 s A4 at half level through a 1.1 ms delay, mixed in whole:
// `plain` with no filter, `filtered` through a resonant lowpass. Rendered at
// 44.1 kHz from 8.0027 s, until the engine would disconnect the chain, with
// soundscape-engine 0.4.1 from npm, as the references are; the window is
// frames 41,728 to 42,752 of each render, from the frame on or before the
// start, as float32, little-endian, in base64. CI does not run this; rerun it
// on purpose.
import { writeFileSync } from 'node:fs';
import { PLAYWRIGHT, firstFrame, npmEngine, renderInBrowser } from './browser.mjs';
import { STARTS } from './conditions.mjs';

const RATE = 44100;
const START = STARTS['8.0027'];
const WINDOW = [41728, 42752];

const instrument = (filter) => ({
  waveform: 'sine',
  pitchOffset: 0,
  attack: 0.07418053232275866,
  decay: 0.25,
  sustain: 1,
  release: 0.1,
  envelopeCurve: 'exponential',
  envelopeFloor: 0.000018,
  filterType: filter ? 'lowpass' : 'none',
  filterCutoff: filter ? 0.6 : 1,
  filterResonance: filter ? 0.9 : 0,
  delayTime: 0.0011,
  delayFeedback: 0,
  delayMix: 1,
  distortion: 0,
  reverbMix: 0,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  unisonDetune: 0,
  velocityResponse: 0,
});
const note = (name) => ({ notes: [{ id: name, instrument: name, start: 0, duration: 2, pitch: 69, level: 0.5 }] });
const document = {
  format: 'soundscape-cues',
  version: 1,
  instruments: { plain: instrument(false), filtered: instrument(true) },
  cues: { plain: note('plain'), filtered: note('filtered') },
};

const { bundle, info: engine } = await npmEngine({ npm: 'soundscape-engine', version: '0.4.1' });
const text = JSON.stringify(document);
const { version, samples } = await renderInBrowser('chromium', text, ['plain', 'filtered'], RATE, START, 2, {
  bundle,
  untilTheChainGoes: true,
});
const windows = {};
for (const [cue, rendered] of Object.entries(samples)) {
  windows[cue] = Buffer.from(rendered.slice(...WINDOW).buffer).toString('base64');
}
const file = {
  about:
    "A window of Chromium's render of each cue, through a delay with no feedback at a delay between frames, played at 8.0027 s at 44.1 kHz: where the delay's write index before the cue decides each read's fraction. Written by delay-wake.mjs; samples are float32, little-endian, in base64, from the frame on or before the start.",
  engine,
  playwright: PLAYWRIGHT,
  chromium: version,
  rate: RATE,
  start: START,
  firstFrame: firstFrame(START, RATE),
  window: WINDOW,
  document,
  windows,
};
writeFileSync(new URL('references/delay-wake-chromium.json', import.meta.url), JSON.stringify(file, null, 2) + '\n');
console.log(`wrote references/delay-wake-chromium.json, Chromium ${version}`);
