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
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
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
