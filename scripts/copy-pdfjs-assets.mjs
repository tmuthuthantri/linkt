// Copies pdf.js standard fonts, CMaps and wasm decoders into public/pdfjs so the
// original statement renders with exact fonts (no network/CDN dependency).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/pdfjs-dist';
for (const dir of ['standard_fonts', 'cmaps', 'wasm']) {
  if (!existsSync(`${src}/${dir}`)) continue;
  mkdirSync(`public/pdfjs/${dir}`, { recursive: true });
  cpSync(`${src}/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs');
