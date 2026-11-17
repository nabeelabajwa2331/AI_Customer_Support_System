import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In development the API is proxied, so the browser talks to one origin and the
// backend needs no CORS configuration.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
