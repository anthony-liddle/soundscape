import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: process.env.BASE_URL || '/',
  plugins: [
    react(),
    {
      name: 'examples-middleware',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/examples') && !req.url.includes('.')) {
            if (req.url === '/examples' || req.url === '/examples/') {
              req.url = '/examples/index.html'
            }
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      'soundscape-engine': path.resolve(__dirname, '../../packages/engine/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      // The editor, and the cue audition page beside the examples. Naming the
      // inputs replaces the default of index.html alone, so it is listed too.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        cues: path.resolve(__dirname, 'examples/cues.html'),
      },
    },
  },
})
