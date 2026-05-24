import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev proxy: any /api request from the frontend gets forwarded to the
    // backend. Two benefits:
    //   1. Same-origin in dev — no CORS preflight, no surprises.
    //   2. Production builds can serve frontend + backend behind one host
    //      with no code changes (just change reverse proxy config).
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});