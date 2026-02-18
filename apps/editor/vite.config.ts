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
})
