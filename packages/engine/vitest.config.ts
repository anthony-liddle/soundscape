import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Real-browser tests run through vitest.browser.config.ts instead
    exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts'],
  },
})
