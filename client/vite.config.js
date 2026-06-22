import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: frontend na :5173, proxy API do serwera Express na :4317.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4317',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
