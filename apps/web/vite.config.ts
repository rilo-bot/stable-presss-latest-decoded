import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Local dev: leave VITE_API_URL unset — `/api` is proxied to the Express app below.
// Production (e.g. Render): build with VITE_API_URL=<backend origin> so `apiUrl()` in `@/lib/api` resolves correctly.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Suppress the red error overlay on syntax errors. While the per-step
    // builder is mid-stream the preview will briefly see incomplete files
    // (a malformed string from one half-written component, an import that
    // resolves once the next file lands). The runnable gate runs at
    // end-of-step and rolls back the whole step on failure, so a transient
    // parse error is not user-visible without this. The error still logs to
    // the console — the WebContainer terminal drawer surfaces real failures.
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})