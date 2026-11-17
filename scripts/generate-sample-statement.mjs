// Generates a realistic *sample* toll statement PDF for demos and parser testing.
// Usage: node scripts/generate-sample-statement.mjs
import { jsPDF } from 'jspdf';
import { writeFileSync, mkdirSync } from 'node:fs';

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const time = (h, m) => `${pad(h)}:${pad(m)}:${pad(Math.floor(rand() * 60))}`;

const TAG = '21130132976';
const morning = [
  ['Logan Mwy Stapylton Rd Entry East', 2.66],
  ['Gateway Ext Kuraby North', 3.45],
  ['Gateway Ext Compton Rd North', 2.12],
];
const evening = [
  ['Gateway Ext Compton Rd South', 2.12],
  ['Gateway Ext Kuraby South', 3.45],
  ['Logan Mwy Stapylton Rd Exit West', 2.66],
];

const rows = [];
const start = new Date(2026, 8, 1); // 1 Sep 2026
const end = new Date(2026, 9, 31);
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const wd = d.getDay();
  const ds = fmtDate(d);
  const isKingsBday = d.getMonth() === 9 && d.getDate() === 5;
  const leave = d.getMonth() === 8 && [21, 22].includes(d.getDate());
  if (wd >= 1 && wd <= 5 && !leave) {
    if (rand() < 0.12 && !isKingsBday) continue; // working from home
    const mh = 7, mm = 32 + Math.floor(rand() * 40);
    let t = mh * 60 + mm;
    for (const [p, a] of morning) {
      rows.push([ds, time(Math.floor(t / 60), t % 60), p, TAG, 'Car', a]);
      t += 6 + Math.floor(rand() * 5);
    }
    if (rand() < 0.15) {
      rows.push([ds, time(13, 10 + Math.floor(rand() * 30)), 'Gateway Mwy Murarrie North', TAG, 'Car', 4.98]);
    }
    if (rand() < 0.88) {
      t = 17 * 60 + 35 + Math.floor(rand() * 45);
      for (const [p, a] of evening) {
        rows.push([ds, time(Math.floor(t / 60), t % 60), p, TAG, 'Car', a]);
        t += 6 + Math.floor(rand() * 5);
      }
    }
  } else if (wd === 6 && rand() < 0.5) {
    rows.push([ds, time(10, 5 + Math.floor(rand() * 40)), 'Logan Mwy Loganlea Rd East', TAG, 'Car', 3.12]);
  }
  if (d.getDate() === 14 || d.getDate() === 28) {
    rows.push([ds, '', 'Payment - thank you', '', '', 50, 'cr']);
    rows.push([ds, '', 'VISA Surcharge', '', '', 0.2]);
  }
}

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const W = doc.internal.pageSize.getWidth();
const H = doc.internal.pageSize.getHeight();
const pitch = 10.08;
let page = 1;

function header(first) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Toll Account Statement & Tax Invoice', 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text('SAMPLE DOCUMENT — generated for demonstration and testing only', 40, 63);
  doc.setTextColor(0);
  doc.setFontSize(9);
  if (first) {
    doc.text('Account number: 4410 2287 31', 40, 86);
    doc.text('Tax invoice number: TI-20261031-88214', 40, 98);
    doc.text('Statement period: 01 Sep 2026 to 31 Oct 2026', 40, 110);
    doc.text('ABN 00 000 000 000', W - 160, 86);
    doc.text('Tag number: 21130132976', W - 160, 98);
  } else {
    doc.text(`Account number: 4410 2287 31 — continued (page ${page})`, 40, 86);
  }
  const y = first ? 140 : 112;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Date', 40, y);
  doc.text('Time', 100, y);
  doc.text('Toll point / Description', 150, y);
  doc.text('Tag / LPN', 360, y);
  doc.text('Class', 430, y);
  doc.text('Amount', W - 40, y, { align: 'right' });
  doc.setLineWidth(0.5);
  doc.line(40, y + 4, W - 40, y + 4);
  doc.setFont('helvetica', 'normal');
  return y + 15;
}

let y = header(true);
let total = 0;
for (const r of rows) {
  if (y > H - 60) {
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`Page ${page}`, W / 2, H - 30, { align: 'center' });
    doc.setTextColor(0);
    doc.addPage();
    page++;
    y = header(false);
  }
  doc.setFontSize(8);
  doc.text(r[0], 40, y);
  if (r[1]) doc.text(r[1], 100, y);
  doc.text(r[2], 150, y);
  if (r[3]) doc.text(r[3], 360, y);
  if (r[4]) doc.text(r[4], 430, y);
  doc.text(`$${r[5].toFixed(2)}${r[6] ? ' cr' : ''}`, W - 40, y, { align: 'right' });
  if (!r[6] && r[1]) total += r[5];
  y += pitch;
}
y += 8;
doc.setFont('helvetica', 'bold');
doc.text('Total tolls this period', 150, y);
doc.text(`$${total.toFixed(2)}`, W - 40, y, { align: 'right' });
doc.setFont('helvetica', 'normal');
doc.text(`Total includes GST of $${(total / 11).toFixed(2)}`, 150, y + pitch);
doc.setFontSize(7.5);
doc.setTextColor(120);
doc.text(`Page ${page}`, W / 2, H - 30, { align: 'center' });

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/sample-toll-statement.pdf', Buffer.from(doc.output('arraybuffer')));
console.log(`Wrote ${rows.length} rows across ${page} pages, toll total $${total.toFixed(2)}`);
