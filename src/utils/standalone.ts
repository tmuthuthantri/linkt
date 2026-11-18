/**
 * Single-file ("standalone") build support — `npm run build:standalone`.
 *
 * In that build every asset lives inside index.html, so workers and wasm cores are
 * created from in-memory copies (blob: URLs) instead of files on a server. That lets
 * the page run from a double-click (file://), an email attachment or any static host.
 * In the normal build MODE is 'production', these branches are dead code and the
 * bundler drops them along with their large ?raw imports.
 */
export const STANDALONE = import.meta.env.MODE === 'standalone';

const jsBlobUrl = (code: string) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));

let pdfWorker: Promise<string> | null = null;
export function standalonePdfWorkerUrl() {
  pdfWorker ??= import('pdfjs-dist/build/pdf.worker.min.mjs?raw').then((m) => jsBlobUrl(m.default));
  return pdfWorker;
}

let ocr: Promise<{ workerPath: string; corePath: string; modelB64: string }> | null = null;
export function standaloneOcrAssets() {
  ocr ??= Promise.all([
    import('tesseract.js/dist/worker.min.js?raw'),
    // SIMD core: supported by every current browser (Chrome/Edge/Firefox, Safari 16.4+).
    import('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?raw'),
    import('../../public/tesseract/lang/eng.traineddata.gz.b64.txt?raw'),
  ]).then(([w, core, model]) => ({
    // One script: the wasm core first, then the worker. Opened from disk (opaque origin) a worker cannot
    // importScripts() a second blob, and Tesseract skips loading the core when TesseractCore already exists.
    workerPath: jsBlobUrl(`${core.default}\n;\n${w.default}`),
    corePath: 'inline.js',
    modelB64: model.default,
  }));
  return ocr;
}

export async function standaloneSampleBytes(): Promise<Uint8Array> {
  const { default: b64 } = await import('./sampleStatement.b64.txt?raw');
  return base64ToBytes(b64);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
