import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Absolute path ("/assets/...") kullaniyoruz ki SPA nested route'lardan
  // (/admin/catalogs vb.) da dogru calissin. base: './' olsaydi,
  // /admin/catalogs'tan ./assets/... /admin/assets/... olarak cozumleniyor
  // ve 404 donuyordu. Tek-service deploy'da root-relative yeterli.
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Faz 0'da minimal. Faz 1'den itibaren vendor chunk ayrımı eklenecek.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
