import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths so the build runs from any host or sub-folder.
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
});
