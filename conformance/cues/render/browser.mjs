// Renders cues offline in Playwright's Chromium, Firefox and WebKit, through
// the engine built from this checkout or one published on npm, exactly as a
// game plays them: one
// AudioEngine on an OfflineAudioContext, loadCues, then playCue at a start
// time. Each render is the window of `seconds` that begins at the frame on or
// before the start, so a start between frames keeps its fraction.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(`${root}packages/engine/package.json`);
const playwright = require('playwright');

export const PLAYWRIGHT = require('playwright/package.json').version;

/** Build the engine from source, so a stale dist can never make a reference. */
export function buildEngine() {
  execFileSync('pnpm', ['--filter', 'soundscape-engine', 'build'], { cwd: root, stdio: 'pipe' });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return {
    name: 'soundscape-engine',
    version: JSON.parse(readFileSync(`${root}packages/engine/package.json`, 'utf8')).version,
    commit: git('rev-parse', 'HEAD'),
    sourceChangedSinceCommit: git('status', '--porcelain', '--', 'packages/engine/src') !== '',
    built: 'from source by this script, packages/engine/dist',
  };
}

/**
 * A published engine, fetched from npm's registry, its tarball checked against
 * the registry's sha512 before it is used. Returns where its bundle is and
 * what was fetched.
 */
export async function npmEngine({ npm: name, version }) {
  const meta = await (await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();
  const tarball = Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer());
  const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
  if (integrity !== meta.dist.integrity)
    throw new Error(`${name}@${version}: the tarball's sha512 is ${integrity}, the registry's ${meta.dist.integrity}`);
  const dir = mkdtempSync(`${tmpdir()}/soundscape-engine-`);
  writeFileSync(`${dir}/package.tgz`, tarball);
  execFileSync('tar', ['-xzf', `${dir}/package.tgz`, '-C', dir]);
  return {
    bundle: `${dir}/package/dist/soundscape-engine.js`,
    info: {
      name,
      version,
      integrity,
      shasum: meta.dist.shasum,
      gitHead: meta.gitHead,
      tarball: meta.dist.tarball,
      built: "from npm by this script, the tarball's sha512 checked against the registry's",
    },
  };
}

/** The first frame of a render: the frame on or before the start. */
export const firstFrame = (start, rate) => Math.floor(start * rate);

/**
 * Renders every named cue of a document in one browser, each in a context of
 * its own. Returns the browser's version and each cue's samples.
 *
 * `bundle` is the engine to use, the build from this checkout by default. With
 * `keepVoices`, no voice is ever disconnected: a render that shows whether the
 * engine's own disposal cut anything.
 */
export async function renderInBrowser(browserName, documentText, cues, rate, start, seconds, { bundle, keepVoices = false } = {}) {
  const engine = readFileSync(bundle ?? `${root}packages/engine/dist/soundscape-engine.js`);
  const files = {
    '/': ['text/html', '<!doctype html><meta charset="utf-8"><title>render</title>'],
    '/engine.js': ['text/javascript', engine],
    '/cues.json': ['application/json', documentText],
  };
  const server = createServer((req, res) => {
    const file = files[req.url];
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': file[0] }).end(file[1]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await playwright[browserName].launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const encoded = await page.evaluate(
      async ({ cues, rate, start, seconds, from, keepVoices }) => {
        const { AudioEngine, VoiceSynthesizer } = await import('/engine.js');
        if (keepVoices) VoiceSynthesizer.prototype.dispose = () => {};
        const doc = await (await fetch('/cues.json')).json();
        const out = {};
        for (const cue of cues) {
          const context = new OfflineAudioContext(1, from + Math.round(rate * seconds), rate);
          const engine = new AudioEngine({ context });
          await engine.initialize();
          engine.loadCues(doc);
          engine.playCue(cue, start);
          const samples = (await context.startRendering()).getChannelData(0).slice(from);
          const bytes = new Uint8Array(samples.buffer);
          let s = '';
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          out[cue] = btoa(s);
        }
        return out;
      },
      { cues, rate, start, seconds, from: firstFrame(start, rate), keepVoices },
    );
    const samples = {};
    for (const [cue, b64] of Object.entries(encoded)) {
      const bytes = Buffer.from(b64, 'base64');
      samples[cue] = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    }
    return { version: browser.version(), samples };
  } finally {
    await browser.close();
    server.close();
  }
}
