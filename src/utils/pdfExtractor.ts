import type { PdfCoords, TagEntry, TollTransaction, VehicleEntry } from '../types';
import { gstOf, round2, uid } from './format';
import { openPdf } from './pdfSetup';

/** A positioned text fragment from pdf.js getTextContent(), in top-left origin PDF points. */
export interface PositionedText {
  str: string;
  x: number;
  baseline: number;
  width: number;
  height: number;
}

export interface TextLine {
  page: number;
  y: number; // baseline (top-left origin)
  x: number;
  right: number;
  text: string;
  items: PositionedText[];
  pageWidth: number;
  pageHeight: number;
}

export interface PageText {
  page: number;
  width: number;
  height: number;
  items: PositionedText[];
}

export interface ExtractionResult {
  transactions: TollTransaction[];
  pageCount: number;
  invoiceRef: string;
  accountNumber: string;
  periodStart: string | null;
  periodEnd: string | null;
  excludedLineCount: number;
  pages: PageText[];
}

// ───────────────────────────── Regexes ─────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const DATE_LONG = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/i;
const DATE_NUM = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const TIME = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i;
const AMOUNT_TAIL = /(-?\$?\s?\d{1,4}(?:,\d{3})*\.\d{2})\s*(cr|CR|Cr|DR|dr)?\s*$/;
const TAG = /\b(\d{11,12})\b/;
const PLATE = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,7}\b/;

const EXCLUDE_PATTERNS: RegExp[] = [
  /payment/i,
  /thank\s*you/i,
  /surcharge/i,
  /\bvisa\b|\bmastercard\b|\bamex\b/i,
  /\btotal\b/i,
  /\bbalance\b/i,
  /opening|closing|carried|brought\s+forward/i,
  /direct\s+debit|top[\s-]?up|refund|adjustment|credit/i,
  /account\s+fee|admin(istration)?\s+fee|statement\s+fee|card\s+fee/i,
  /\bsubtotal\b|\bsub-total\b/i,
];

const ROAD_RULES: { test: RegExp; road: string }[] = [
  { test: /gateway\s+(upgrade|bridge)|sir\s+leo\s+hielscher|murarrie|gateway\s+mwy|gateway\s+motorway/i, road: 'Gateway Motorway' },
  { test: /compton|kuraby|gateway\s+ext/i, road: 'Gateway Extension Motorway' },
  { test: /stapylton|loganlea|logan\s+(mwy|motorway)|heathwood|paradise\s+rd|drewvale|beaudesert\s+rd|wembley\s+rd|centenary/i, road: 'Logan Motorway' },
  { test: /go\s*between|merivale|hale\s+st/i, road: 'Go Between Bridge' },
  { test: /clem\s*7|clem\s+jones/i, road: 'Clem7 Motorway' },
  { test: /legacy\s+way/i, road: 'Legacy Way' },
  { test: /airport\s*link|airportlink|kedron|toombul|bowen\s+hills/i, road: 'AirportLinkM7' },
  { test: /citylink|burnley|domain\s+tunnel|west\s+gate|bolte/i, road: 'CityLink' },
  { test: /eastlink/i, road: 'EastLink' },
  { test: /westconnex|\bm4\b|\bm8\b|\bm5\s+east|rozelle/i, road: 'WestConnex' },
  { test: /\bm2\b|lane\s+cove|cross\s+city|eastern\s+distributor|harbour\s+(bridge|tunnel)|northconnex|\bm7\b/i, road: 'Sydney Motorways' },
];

const DIRECTION = /\b(North(?:bound)?|South(?:bound)?|East(?:bound)?|West(?:bound)?|NB|SB|EB|WB|Inbound|Outbound|Entry|Exit|On|Off)\b/gi;

// ───────────────────────────── Helpers ─────────────────────────────
export function parseDate(text: string): { iso: string; index: number; length: number } | null {
  const l = DATE_LONG.exec(text);
  if (l) {
    const d = Number(l[1]);
    const m = MONTHS[l[2].toLowerCase().slice(0, l[2].toLowerCase().startsWith('sept') ? 4 : 3)] ?? MONTHS[l[2].toLowerCase().slice(0, 3)];
    const y = Number(l[3]);
    if (m && d >= 1 && d <= 31) return { iso: `${y}-${pad(m)}-${pad(d)}`, index: l.index, length: l[0].length };
  }
  const n = DATE_NUM.exec(text);
  if (n) {
    const d = Number(n[1]);
    const m = Number(n[2]);
    let y = Number(n[3]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { iso: `${y}-${pad(m)}-${pad(d)}`, index: n.index, length: n[0].length };
  }
  return null;
}

function parseTime(text: string): { value: string; index: number; length: number } | null {
  const t = TIME.exec(text);
  if (!t) return null;
  let h = Number(t[1]);
  const m = Number(t[2]);
  const s = Number(t[3] ?? 0);
  const ampm = t[4]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || m > 59 || s > 59) return null;
  return { value: `${pad(h)}:${pad(m)}:${pad(s)}`, index: t.index, length: t[0].length };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function classifyRoad(text: string): string {
  for (const r of ROAD_RULES) if (r.test.test(text)) return r.road;
  return 'Toll Road';
}

function extractDirection(text: string): string {
  const found = [...text.matchAll(DIRECTION)].map((m) => m[1]);
  if (!found.length) return '—';
  const norm = found.map((d) => {
    const u = d.toUpperCase();
    if (u === 'NB') return 'Northbound';
    if (u === 'SB') return 'Southbound';
    if (u === 'EB') return 'Eastbound';
    if (u === 'WB') return 'Westbound';
    return d[0].toUpperCase() + d.slice(1).toLowerCase();
  });
  return [...new Set(norm)].join(' ');
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/[$,\s]/g, ''));
}

/** Group pdf.js text items into visual lines using a baseline tolerance. */
export function groupLines(page: PageText, tolerance = 2.6): TextLine[] {
  const items = page.items.filter((i) => i.str.trim().length > 0).sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const lines: TextLine[] = [];
  for (const it of items) {
    let line = lines.find((l) => Math.abs(l.y - it.baseline) <= tolerance);
    if (!line) {
      line = { page: page.page, y: it.baseline, x: it.x, right: it.x + it.width, text: '', items: [], pageWidth: page.width, pageHeight: page.height };
      lines.push(line);
    }
    line.items.push(it);
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.x = Math.min(...l.items.map((i) => i.x));
    l.right = Math.max(...l.items.map((i) => i.x + i.width));
    // join with spacing awareness
    let text = '';
    let prevEnd = -Infinity;
    for (const it of l.items) {
      const gap = it.x - prevEnd;
      if (text && gap > 1.2 && !text.endsWith(' ')) text += gap > 14 ? '   ' : ' ';
      text += it.str;
      prevEnd = it.x + it.width;
    }
    l.text = text.replace(/\s+$/, '');
    // average baseline (stabilises small jitter)
    l.y = l.items.reduce((s, i) => s + i.baseline, 0) / l.items.length;
  }
  return lines.sort((a, b) => a.y - b.y);
}

function findHeaderValue(lines: TextLine[], patterns: RegExp[]): string {
  for (const l of lines) {
    for (const p of patterns) {
      const m = p.exec(l.text);
      if (m && m[1]) return m[1].trim();
    }
  }
  return '';
}

export interface ParseOptions {
  statementId: string;
  vehicles?: VehicleEntry[];
  tags?: TagEntry[];
}

/** Pure parser over positioned page text — used by the browser extractor and by tests. */
export function parsePages(pages: PageText[], opts: ParseOptions): ExtractionResult {
  const allLines = pages.flatMap((p) => groupLines(p));
  const invoiceRef = findHeaderValue(allLines, [
    /tax\s+invoice\s+(?:no\.?|number|#)\s*:?\s*([A-Z0-9-]{4,})/i,
    /invoice\s+(?:no\.?|number|#|ref(?:erence)?)\s*:?\s*([A-Z0-9-]{4,})/i,
    /statement\s+(?:no\.?|number|#)\s*:?\s*([A-Z0-9-]{4,})/i,
  ]);
  const accountNumber = findHeaderValue(allLines, [/account\s+(?:no\.?|number|#)\s*:?\s*([0-9][0-9 -]{4,}[0-9])/i, /customer\s+(?:no\.?|number)\s*:?\s*([0-9]{5,})/i]);
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  for (const l of allLines) {
    if (/period|statement\s+date|from/i.test(l.text)) {
      const dates = [...l.text.matchAll(new RegExp(`${DATE_LONG.source}|${DATE_NUM.source}`, 'gi'))].map((m) => parseDate(m[0])?.iso).filter(Boolean) as string[];
      if (dates.length >= 2) {
        periodStart = dates[0];
        periodEnd = dates[1];
        break;
      }
    }
  }

  const knownPlates = (opts.vehicles ?? []).map((v) => v.plate.toUpperCase().replace(/\s+/g, ''));
  const knownTags = new Map((opts.tags ?? []).map((t) => [t.tagNumber.replace(/\D/g, ''), t]));

  const transactions: TollTransaction[] = [];
  let excluded = 0;
  let carryDate: string | null = null;

  for (const line of allLines) {
    const text = line.text.replace(/\s+/g, ' ').trim();
    const amountMatch = AMOUNT_TAIL.exec(text);
    const date = parseDate(text);
    if (date && date.index < 4) carryDate = date.iso;
    if (!amountMatch) continue;

    const isCredit = !!amountMatch[2] && /cr/i.test(amountMatch[2]);
    const rawAmount = amountMatch[1];
    const amount = Math.abs(parseAmount(rawAmount));
    const hasDate = !!date && date.index < 4;
    const time = parseTime(text);

    // Only rows that look like a dated (or time-continued) ledger line.
    if (!hasDate && !(time && time.index < 3 && carryDate)) continue;

    if (isCredit || rawAmount.trim().startsWith('-') || EXCLUDE_PATTERNS.some((p) => p.test(text)) || !time) {
      excluded++;
      continue;
    }
    if (!(amount > 0 && amount < 100)) {
      excluded++;
      continue;
    }

    const isoDate = hasDate ? date!.iso : carryDate!;
    // Description = text between time and amount
    let desc = text;
    if (hasDate) desc = desc.slice(0, date!.index) + desc.slice(date!.index + date!.length);
    const t2 = parseTime(desc);
    if (t2) desc = desc.slice(0, t2.index) + desc.slice(t2.index + t2.length);
    desc = desc.replace(AMOUNT_TAIL, '').trim();

    let tagNumber: string | null = null;
    const tagM = TAG.exec(desc);
    if (tagM) {
      tagNumber = tagM[1];
      desc = desc.replace(tagM[0], ' ');
    }
    let vehicleRego: string | null = null;
    const upper = desc.toUpperCase();
    const known = knownPlates.find((p) => p && new RegExp(`\\b${p}\\b`).test(upper.replace(/\s+/g, ' ')));
    if (known) {
      vehicleRego = known;
      desc = desc.replace(new RegExp(`\\b${known}\\b`, 'i'), ' ');
    } else {
      const pm = PLATE.exec(desc);
      if (pm) {
        vehicleRego = pm[1];
        desc = desc.replace(pm[0], ' ');
      }
    }
    if (!vehicleRego && tagNumber && knownTags.get(tagNumber)?.plate) vehicleRego = knownTags.get(tagNumber)!.plate!.toUpperCase();

    let transactionType = /video|lpn|plate\s+match/i.test(desc) ? 'Video Toll' : tagNumber ? 'Tag Toll Trip' : 'Toll Trip';
    if (/\bclass\s*\d\b/i.test(desc)) transactionType += ` (${/\bclass\s*(\d)\b/i.exec(desc)![0]})`;
    desc = desc
      .replace(/\b(Car|Class\s*\d|LCV|HCV|Motorcycle|Video toll|Tag)\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[-–|,:\s]+|[-–|,:\s]+$/g, '')
      .trim();

    const tollPoint = desc || 'Toll point';
    const road = classifyRoad(tollPoint);
    const direction = extractDirection(tollPoint);

    const amountItem = [...line.items].reverse().find((i) => /\d\.\d{2}/.test(i.str));
    const pdfCoords: PdfCoords = {
      page: line.page,
      x: line.x,
      y: line.y - 7.5,
      width: line.right - line.x,
      height: 9.5,
      baseline: line.y,
      pageWidth: line.pageWidth,
      pageHeight: line.pageHeight,
      amountX: amountItem?.x,
    };

    transactions.push({
      id: uid('txn'),
      statementId: opts.statementId,
      date: isoDate,
      time: time.value,
      road,
      tollPoint,
      direction,
      vehicleRego,
      tagNumber,
      transactionType,
      amount: round2(amount),
      gst: gstOf(amount),
      invoiceRef,
      accountNumber,
      rawText: line.text,
      pdfCoords,
    });
  }

  if (!periodStart && transactions.length) {
    const dates = transactions.map((t) => t.date).sort();
    periodStart = dates[0];
    periodEnd = dates[dates.length - 1];
  }

  return { transactions, pageCount: pages.length, invoiceRef, accountNumber, periodStart, periodEnd, excludedLineCount: excluded, pages };
}

/** Read positioned text from every page of a PDF using pdf.js. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readPdfText(pdf: any): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PositionedText[] = [];
    for (const raw of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
      if (typeof raw.str !== 'string' || !raw.transform) continue;
      const [a, b, , , e, f] = raw.transform;
      // Convert PDF user space → viewport (top-left origin) using the viewport transform.
      const [vx, vy] = viewport.convertToViewportPoint(e, f);
      const fontSize = Math.hypot(a, b) || raw.height || 10;
      items.push({ str: raw.str, x: vx, baseline: vy, width: raw.width ?? 0, height: fontSize });
    }
    pages.push({ page: p, width: viewport.width, height: viewport.height, items });
    page.cleanup?.();
  }
  return pages;
}

export async function extractFromPdfBytes(bytes: Uint8Array, opts: ParseOptions): Promise<ExtractionResult> {
  const pdf = await openPdf(bytes);
  try {
    const pages = await readPdfText(pdf);
    return parsePages(pages, opts);
  } finally {
    pdf.destroy();
  }
}
