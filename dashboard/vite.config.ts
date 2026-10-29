import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Read PORT from the project's root .env so the dashboard always talks to the right API.
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, '..'), '')
  const apiTarget = `http://localhost:${rootEnv.PORT || 4000}`

  // On Vercel and Render, the dashboard is a separate website from the API, so it must be told the API's address.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  const host = process.env.VERCEL ? 'Vercel' : process.env.RENDER ? 'Render' : null
  if (command === 'build' && host && !env.VITE_API_URL) {
    throw new Error(
      `VITE_API_URL is not set. In ${host} → the dashboard → Environment Variables, ` +
        'add VITE_API_URL = your API address (e.g. https://meeranji-api.onrender.com), then redeploy.',
    )
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // During development, requests to /api, /uploads and /sample-images are forwarded to the
      // API server, so the dashboard and API behave as if they were on the same website.
      proxy: {
        '/api': apiTarget,
        '/uploads': apiTarget,
        '/sample-images': apiTarget,
      },
    },
  }
})
