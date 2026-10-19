// Plays the games' music in Playwright's browsers, through an engine bundle,
// with harness.js: each render in a page of its own.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = new URL('.', import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(`${root}packages/engine/package.json`);
const playwright = require('playwright');

export const PLAYWRIGHT = require('playwright/package.json').version;

/** The songs, by the name the harness knows each game by. */
export const SONGS = { rps: 'rock-paper-scissors.json', fm: 'the-forgetting-machine.json' };

/** Each browser, and how it is driven: Firefox's OfflineAudioContext has no suspend. */
export const MODES = { chromium: 'lockstep', webkit: 'lockstep', firefox: 'prescheduled' };

/**
 * Each game as the references play it, from a start at 0.128 s:
 * - Rock Paper Scissors from CALM, its tension rising round by round through
 *   every level to MELTDOWN, each step a setTempo and an updateMixer, as the
 *   game makes them, then 10.5 s at MELTDOWN;
 * - The Forgetting Machine whole, 70 beats at 70 bpm, then its fade, which the
 *   game starts 61.5 s in, once its broadcast and the page's fade are over,
 *   and its stop 7 s later.
 */
export const SCENARIOS = {
  rps: {
    game: 'rps',
    // The generated glitch track's draws, which the game takes from Math.random
    glitchSeed: 2,
    seconds: 36.5,
    playAt: 0.128,
    actions: [
      { at: 8, tension: 'UNEASY' },
      { at: 14, tension: 'IRRITATED' },
      { at: 20, tension: 'UNSTABLE' },
      { at: 26, tension: 'MELTDOWN' },
    ],
  },
  fm: { game: 'fm', seconds: 70, playAt: 0.128, actions: [{ at: 61.5, fadeOut: true }] },
};

function decode(b64) {
  const bytes = Buffer.from(b64, 'base64');
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/**
 * Renders each job in a fresh page of one browser, through `bundle`, the
 * engine built from this checkout by default. Returns the browser's version,
 * and for each job its two channels and what the engine did: every note it
 * started, every voice it stole, and anything it threw.
 */
export async function renderSongs(browserName, jobs, { bundle } = {}) {
  const files = {
    '/': ['text/html', '<!doctype html><meta charset="utf-8"><title>songs</title><script type="module" src="/harness.js"></script>'],
    '/engine.js': ['text/javascript', readFileSync(bundle ?? `${root}packages/engine/dist/soundscape-engine.js`)],
    '/harness.js': ['text/javascript', readFileSync(new URL('harness.js', here))],
  };
  for (const [name, file] of Object.entries(SONGS)) {
    files[`/songs/${name}.json`] = ['application/json', readFileSync(new URL(`fixtures/${file}`, here))];
  }
  const server = createServer((req, res) => {
    const file = files[req.url];
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': file[0] }).end(file[1]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await playwright[browserName].launch();
  try {
    const out = [];
    for (const job of jobs) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.harnessReady === true);
      const result = await page.evaluate((o) => window.renderSong(o), { mode: MODES[browserName], ...job });
      await page.close();
      const { channels, ...meta } = result;
      out.push({ job, channels: channels.map(decode), meta: { ...meta, errors } });
    }
    return { version: browser.version(), renders: out };
  } finally {
    await browser.close();
    server.close();
  }
}
