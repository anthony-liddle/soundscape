// Plays both games' music in Chromium, WebKit and Firefox, through the engine
// built from this checkout, and says what each browser's engine did.
//
//   node conformance/songs/play.mjs
import { buildEngine } from '../cues/render/browser.mjs';
import { MODES, PLAYWRIGHT, SCENARIOS, renderSongs } from './render.mjs';
import { rmsDb } from './compare.mjs';

const engine = buildEngine();
console.log(`engine ${engine.version} at ${engine.commit.slice(0, 7)}${engine.sourceChangedSinceCommit ? ', its source changed since' : ''}; Playwright ${PLAYWRIGHT}`);
for (const browser of Object.keys(MODES)) {
  const { version, renders } = await renderSongs(browser, Object.values(SCENARIOS));
  for (const { job, channels, meta } of renders) {
    let peak = 0;
    for (const x of channels[0]) peak = Math.max(peak, Math.abs(x));
    console.log(
      `${browser} ${version}, ${MODES[browser]}, ${job.game}: ${job.seconds} s, peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS, ` +
        `RMS ${rmsDb(channels[0], meta.playFrame).toFixed(2)} dBFS; notes ${JSON.stringify(meta.played)}; ` +
        `steals ${JSON.stringify(meta.steals)}; thrown ${meta.thrown.length}`
    );
  }
}
