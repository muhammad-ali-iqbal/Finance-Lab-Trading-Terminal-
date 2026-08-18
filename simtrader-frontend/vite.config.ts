import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// VITE_BASE_PATH is a build-time-only arg (see Dockerfile/docker-compose.yml)
// for deploying under a reverse-proxy subpath (e.g. "/simtrader"). Unset in
// local dev, so `npm run dev`/`vite preview` are unaffected.
const basePath = process.env.VITE_BASE_PATH

export default defineConfig({
  base: basePath ? `${basePath}/` : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true, // listen on all interfaces so LAN devices can connect
    proxy: {
      // Proxy all /api requests to Go backend (REST + WebSocket)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // Forward WebSocket upgrades
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
