// Copies the single-file build to a friendly, shareable name and reports its size.
import { copyFileSync, statSync, mkdirSync } from 'node:fs';
mkdirSync('standalone', { recursive: true });
copyFileSync('dist-standalone/index.html', 'standalone/linkt-toll-reimbursement-assistant.html');
const mb = (statSync('standalone/linkt-toll-reimbursement-assistant.html').size / 1024 / 1024).toFixed(1);
console.log(`standalone/linkt-toll-reimbursement-assistant.html (${mb} MB) — open it directly in a browser`);
