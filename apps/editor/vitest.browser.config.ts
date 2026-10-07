import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'

/**
 * Tests that only mean something in a real browser: the Cues view driven by
 * the keyboard, with real focus and :focus-visible, and Peach of a Word's cue
 * file opened, played and saved back byte for byte. They are kept out of the
 * jsdom suite, and so out of the pre-commit hook, because they need
 * Playwright's browsers installed.
 *
 *   pnpm --filter editor test:browser                    every browser
 *   pnpm --filter editor test:browser --browser=firefox  one of them
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // One React for the app and Testing Library, as the jsdom suite has
    dedupe: ['react', 'react-dom'],
    alias: {
      'soundscape-engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', '@testing-library/react'],
  },
  test: {
    include: ['src/**/*.browser.test.{ts,tsx}'],
    testTimeout: 180_000,
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
