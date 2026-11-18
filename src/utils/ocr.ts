import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { assetUrl } from './format';
import { STANDALONE, base64ToBytes, standaloneOcrAssets } from './standalone';
import { wordsToRows, type OcrWord } from './leaveScreenshotParser';

/**
 * On-device OCR with Tesseract.js. Worker, wasm core and the English model are
 * served from /tesseract (copied by scripts/copy-vendor-assets.mjs), so leave
 * screenshots never leave the browser and no CDN is needed.
 */
let workerPromise: Promise<Worker> | null = null;
let progressCb: ((p: number, status: string) => void) | null = null;

/**
 * Tesseract reads `./eng.traineddata` from its IndexedDB cache (idb-keyval default
 * store) before fetching. Seeding it from a base64 text copy of the model lets the
 * app run on hosts that refuse to serve .gz / .traineddata files.
 */
async function seedModelCache(base: string, inlineB64?: string) {
  const key = './eng.traineddata';
  try {
    if (await idbGet(key)) return;
    let b64 = inlineB64;
    if (!b64) {
      const res = await fetch(`${base}/lang/eng.traineddata.gz.b64.txt`);
      if (!res.ok) return; // fall back to Tesseract fetching eng.traineddata.gz itself
      b64 = await res.text();
    }
    await idbSet(key, base64ToBytes(b64)); // gzipped — Tesseract detects and gunzips it
  } catch {
    /* storage unavailable — Tesseract will fetch the model normally */
  }
}

function getWorker() {
  if (!workerPromise) {
    const base = STANDALONE ? '' : assetUrl('tesseract');
    workerPromise = (STANDALONE ? standaloneOcrAssets() : Promise.resolve(null))
      .then(async (inline) => {
        await seedModelCache(base, inline?.modelB64);
        return inline;
      })
      .then((inline) => createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: inline ? inline.workerPath : `${base}/worker.min.js`,
      corePath: inline ? inline.corePath : `${base}/core`,
      langPath: `${base}/lang`,
      gzip: true,
      cacheMethod: 'write',
      // Load the worker script directly (same origin) rather than via a blob: URL — friendlier to strict CSPs.
      workerBlobURL: false,
      logger: (m: { progress: number; status: string }) => progressCb?.(m.progress, m.status),
    })).then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      return w;
    });
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Upscale small screenshots and convert to high-contrast greyscale — big accuracy win for UI text. */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1600 ? Math.min(3, 1600 / bmp.width) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const darkUi = sum / (d.length / 4) < 110; // dark-mode screenshot → invert so text is dark on light
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (darkUi) g = 255 - g;
    g = g < 150 ? Math.max(0, g * 0.6) : Math.min(255, g * 1.15); // stretch contrast; keeps pale table text
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function ocrImage(file: Blob, onProgress?: (p: number, status: string) => void): Promise<{ text: string; confidence: number }> {
  progressCb = onProgress ?? null;
  try {
    const [worker, canvas] = await Promise.all([getWorker(), preprocess(file)]);
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines) for (const w of l.words) words.push({ text: w.text, ...w.bbox });
    // Row-reconstructed text keeps table rows (type + dates + status) together.
    const text = words.length ? wordsToRows(words) : data.text;
    return { text, confidence: data.confidence };
  } finally {
    progressCb = null;
  }
}
