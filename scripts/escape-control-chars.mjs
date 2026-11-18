// Rewrites raw control bytes (other than tab/newline/CR) in built JS/CSS as \xHH escapes.
// Minifiers emit them inside string/regex literals, where the escape is equivalent,
// but some static hosts refuse text files containing them.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist';
let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|css)$/.test(name)) {
      const src = readFileSync(p, 'utf8');
      let n = 0;
      const out = src.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => {
        n++;
        return `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`;
      });
      if (n) {
        writeFileSync(p, out);
        files++;
        bytes += n;
      }
    }
  }
};
walk(root);
console.log(`Escaped ${bytes} control character(s) in ${files} file(s)`);
