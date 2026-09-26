import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const apiDir = fileURLToPath(new URL('../api', import.meta.url));

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The API's Origin allowlist expects http://localhost:5173, so don't let Vite pick another port.
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  define: {
    // Dev-only convenience for the Demo accounts panel: the seed password stays in apps/api/.env
    // and never reaches a production build.
    __DEMO_PASSWORD__: JSON.stringify(
      (command === 'serve' && mode !== 'test' && loadEnv(mode, apiDir, 'SEED_').SEED_PASSWORD) || null,
    ),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));
