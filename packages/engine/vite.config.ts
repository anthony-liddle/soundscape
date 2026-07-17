import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    // Bundle all declarations into a single flat index.d.ts. Per-module d.ts
    // files use extensionless relative imports, which fail to resolve for
    // consumers on node16/nodenext module resolution.
    dts({ bundleTypes: true, tsconfigPath: './tsconfig.build.json' }),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: 'soundscape-engine',
    },
  },
})
