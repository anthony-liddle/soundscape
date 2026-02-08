import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_URL || '/',
  plugins: [
    react(),
    {
      name: 'examples-middleware',
      configureServer(server) {
        // Serve /examples/ requests before SPA fallback kicks in
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/examples') && !req.url.includes('.')) {
            // Redirect /examples to /examples/index.html
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
      '@': path.resolve(__dirname, './src'),
    },
  },
})
