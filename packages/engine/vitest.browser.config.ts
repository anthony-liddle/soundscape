import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

/**
 * Tests that only mean something in a real browser: the committed cues held
 * to the oracle in Chromium, Firefox and WebKit, each rendered offline in the
 * browser itself. They are kept out of the jsdom suite, and so out of the
 * pre-commit hook, because they need Playwright's browsers installed.
 *
 *   pnpm test:browser                    every browser
 *   pnpm test:browser --browser=firefox  one of them
 */
export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      // The page renders audio, not pixels, so a failure's screenshot shows nothing
      screenshotFailures: false,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
