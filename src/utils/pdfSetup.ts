/**
 * Central PDF.js setup — imported first in main.tsx. The polyfill module is
 * imported before pdfjs-dist so the APIs exist when pdf.js evaluates.
 */
import './pdfPolyfills';
import { assetUrl } from './format';
import * as pdfjsLib from 'pdfjs-dist';
import { STANDALONE, standalonePdfWorkerUrl } from './standalone';

let workerReady: Promise<void> | null = null;
function ensureWorker() {
  workerReady ??= (async () => {
    if (STANDALONE) {
      // Single-file build. Opened from disk the page has an opaque origin, so pdf.js runs the
      // worker code on the main thread ("fake worker"); fine for statements of a few pages.
      pdfjsLib.GlobalWorkerOptions.workerSrc = await standalonePdfWorkerUrl();
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    }
  })();
  return workerReady;
}

export { pdfjsLib };

/** Open a PDF from bytes. Always copies the buffer — pdf.js detaches what it is given. */
export async function openPdf(bytes: Uint8Array) {
  await ensureWorker();
  const task = pdfjsLib.getDocument(
    STANDALONE
      ? // Single-file build: no font/wasm folders to fetch — fall back to system fonts and JS decoders.
        { data: bytes.slice(), useSystemFonts: true }
      : {
          data: bytes.slice(),
          standardFontDataUrl: assetUrl('pdfjs/standard_fonts/'),
          cMapUrl: assetUrl('pdfjs/cmaps/'),
          cMapPacked: true,
          wasmUrl: assetUrl('pdfjs/wasm/'),
        },
  );
  const pdf = await task.promise;
  // Newer pdf.js versions only expose destroy() on the loading task.
  return Object.assign(pdf, { destroy: () => task.destroy() });
}
