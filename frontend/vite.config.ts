import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      // Any request starting with /api is forwarded to Django in local dev.
      // In production, VITE_API_URL in client.ts prepends the Render URL instead.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true, // rewrites Host header to match target — required for Django ALLOWED_HOSTS
        cookiePathRewrite: { '*': '/' }, // preserves cookie paths through the proxy (needed for httpOnly auth cookies)
      },
    },
  },
})
