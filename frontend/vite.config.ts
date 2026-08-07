import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
// vitest/config re-exports Vite's defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    /**
     * Fail rather than drift to 5174.
     *
     * The port is not cosmetic: it is in the backend's `CORS_ORIGIN`, and
     * `/api/auth/refresh` rejects any Origin outside that list (auth/cookies.ts,
     * hasAllowedOrigin). Vite's default is to pick the next free port, and
     * `changeOrigin` rewrites Host but *not* Origin — so on 5174 login still
     * succeeds and sets the cookie, while every refresh comes back 401. The app
     * looks signed in until you reload, then silently bounces to /login.
     *
     * A stale dev server holding 5173 is enough to cause it. Better to refuse
     * to start than to boot into a build where session restore cannot work.
     */
    strictPort: true,
    // Proxy keeps the browser same-origin in dev, so CORS and cookie behaviour
    // match production instead of being a dev-only special case.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
