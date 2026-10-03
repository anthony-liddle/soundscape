import { dirname } from 'node:path'
import ts from 'typescript'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// `typescript` is aliased to @typescript/typescript6 so tooling keeps the TS 6
// compiler API while `tsc` runs TS 7. That package is a shim around the real
// compiler and ships no lib.*.d.ts files, so api-extractor (which defaults to
// the folder of whatever `typescript` resolves to) cannot find lib types such
// as `Partial`. Point it at the package that actually holds the lib files.
const typescriptCompilerFolder = dirname(dirname(ts.getDefaultLibFilePath({})))

export default defineConfig({
  plugins: [
    // Bundle all declarations into a single flat index.d.ts. Per-module d.ts
    // files use extensionless relative imports, which fail to resolve for
    // consumers on node16/nodenext module resolution.
    dts({
      bundleTypes: { invokeOptions: { typescriptCompilerFolder } },
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: 'soundscape-engine',
    },
  },
})
