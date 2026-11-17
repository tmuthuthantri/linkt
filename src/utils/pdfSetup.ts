/**
 * Central PDF.js setup — imported first in main.tsx. The polyfill module is
 * imported before pdfjs-dist so the APIs exist when pdf.js evaluates.
 */
import './pdfPolyfills';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

/** Open a PDF from bytes. Always copies the buffer — pdf.js detaches what it is given. */
export async function openPdf(bytes: Uint8Array) {
  const base = import.meta.env.BASE_URL;
  const task = pdfjsLib.getDocument({
    data: bytes.slice(),
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    wasmUrl: `${base}pdfjs/wasm/`,
  });
  const pdf = await task.promise;
  // Newer pdf.js versions only expose destroy() on the loading task.
  return Object.assign(pdf, { destroy: () => task.destroy() });
}
