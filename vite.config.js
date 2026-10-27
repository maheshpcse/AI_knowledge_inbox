import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ exclude: [/node_modules/, /\.vite-cache/] })],
  // Keep Vite's mutable optimizer cache separate from node_modules on Windows.
  cacheDir: '.vite-cache',
  server: {
    // Avoid two dev servers competing for the same dependency cache.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
});
