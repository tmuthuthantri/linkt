// Copies runtime assets into public/ so the app works fully offline with no CDN:
//  - pdf.js standard fonts, CMaps and wasm decoders (exact statement rendering)
//  - Tesseract.js worker, LSTM wasm cores and English model (on-device leave screenshot OCR)
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';

const pdfjs = 'node_modules/pdfjs-dist';
for (const dir of ['standard_fonts', 'cmaps', 'wasm']) {
  if (!existsSync(`${pdfjs}/${dir}`)) continue;
  mkdirSync(`public/pdfjs/${dir}`, { recursive: true });
  cpSync(`${pdfjs}/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
}

const out = 'public/tesseract';
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
copyFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', `${out}/lang/eng.traineddata.gz`);

console.log('Vendor assets copied to public/pdfjs and public/tesseract');
