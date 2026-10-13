import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read PORT from the project's root .env so the dashboard always talks to the right API.
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, '..'), '')
  const apiTarget = `http://localhost:${rootEnv.PORT || 4000}`

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // During development, requests to /api and /uploads are forwarded to the API server,
      // so the dashboard and API behave as if they were on the same website.
      proxy: {
        '/api': apiTarget,
        '/uploads': apiTarget,
      },
    },
  }
})
