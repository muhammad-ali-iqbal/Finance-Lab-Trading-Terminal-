import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy all /api requests to Go backend (REST + WebSocket)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // Forward WebSocket upgrades
      },
    },
  },
})
