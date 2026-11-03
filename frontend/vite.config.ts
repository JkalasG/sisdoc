import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Mismo origen para las cookies de sesión (SameSite=Strict): /api y /socket.io van al backend.
    proxy: {
      // xfwd: el proxy agrega la IP real del navegador en X-Forwarded-For (el backend la lee con TRUST_PROXY=1).
      '/api': { target: 'http://localhost:3000', xfwd: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, xfwd: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    env: { VITE_USE_MOCKS: 'true' }, // las pruebas SIEMPRE corren contra el backend simulado
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 20000,
  },
});
