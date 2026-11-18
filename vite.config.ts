import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

/** Inline the favicon so the single-file build has no external references. */
const inlineFavicon = (): Plugin => ({
  name: 'inline-favicon',
  transformIndexHtml: (html) =>
    html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}"`),
});

export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    // Relative asset paths so the build runs from any host or sub-folder.
    base: './',
    plugins: [react(), tailwindcss(), ...(standalone ? [inlineFavicon(), viteSingleFile({ removeViteModuleLoader: true })] : [])],
    // The single-file build carries everything inside index.html — nothing from public/.
    publicDir: standalone ? false : 'public',
    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: standalone ? 20000 : 2500,
      outDir: standalone ? 'dist-standalone' : 'dist',
    },
  };
});
