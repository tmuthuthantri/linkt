import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import type { LeaveType } from '../types';

/**
 * Turns OCR text from a screenshot of an HR / payroll leave screen (Workday,
 * Employment Hero, SuccessFactors, MYOB, Xero, Outlook calendar, etc.) into
 * candidate leave ranges. Pure + deterministic so it can be unit-tested.
 */

export type LeaveStatus = 'approved' | 'pending' | 'declined' | 'unknown';

export interface LeaveCandidate {
  id: string;
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd (inclusive)
  type: LeaveType;
  typeGuessed: boolean;
  status: LeaveStatus;
  partial: boolean; // half day / hours-based
  include: boolean;
  source: string; // OCR line(s) it came from
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WD = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday|sday)?\\.?,?\\s+)?';

interface DateToken {
  index: number;
  end: number;
  day: number;
  month: number;
  year: number | null;
}

const TYPE_RULES: { re: RegExp; type: LeaveType }[] = [
  { re: /long\s*service|\blsl\b/i, type: 'Long Service' },
  { re: /\brdo\b|rostered\s+day\s+off|day\s+in\s+lieu|time\s+in\s+lieu|\btoil\b|flex(i)?\s*(day|time)/i, type: 'RDO' },
  { re: /sick|illness|medical/i, type: 'Sick' },
  { re: /carer|personal|family\s+(and|&)\s+domestic|compassionate|bereavement/i, type: 'Personal' },
  { re: /training|study|course|conference|exam/i, type: 'Training' },
  { re: /annual|vacation|holiday\s+leave|\bleave\s+-\s+annual|\bpto\b|purchased\s+leave/i, type: 'Annual' },
  { re: /parental|maternity|paternity|jury|unpaid|without\s+pay|\blwop\b|defen[cs]e|volunteer|community\s+service|leave/i, type: 'Other' },
];

const DECLINED = /declin|reject|cancel|withdrawn|denied|not\s+approved/i;
const PENDING = /pending|submitted|awaiting|requested|in\s+progress|for\s+approval/i;
const APPROVED = /approved|accepted|confirmed|taken|booked/i;
const PARTIAL = /half[\s-]*day|(^|\s)0?\.50?(\s*d(ays?)?)?(\s|$)|\bam\s+only\b|\bpm\s+only\b|\b[1-6](\.\d+)?\s*(h|hr|hrs|hours)\b/i;
const NOT_LEAVE_DATE = /(submitted|requested|created|applied|approved|updated|modified|printed|generated)\s*(on|:)?\s*$/i;

/** Clean common OCR confusions inside numbers. */
export function normaliseOcr(text: string): string {
  return text
    .replace(/[‒-―−]/g, '-')
    .replace(/(?<=\d)[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|](?=\d)/g, '1')
    .replace(/(?<=\d)\s*\/\s*(?=\d)/g, '/')
    .replace(/[ \t]+/g, ' ');
}

function findDates(line: string): DateToken[] {
  const out: DateToken[] = [];
  const taken: [number, number][] = [];
  const push = (m: RegExpExecArray, day: number, month: number, year: number | null) => {
    const s = m.index;
    const e = m.index + m[0].length;
    if (taken.some(([a, b]) => s < b && e > a)) return;
    if (month < 1 || month > 12 || day < 1 || day > 31) return;
    if (year !== null && year < 100) year += 2000;
    if (year !== null && (year < 2000 || year > 2100)) return;
    taken.push([s, e]);
    out.push({ index: s, end: e, day, month, year });
  };
  let m: RegExpExecArray | null;
  // ISO 2026-08-12
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(line))) push(m, +m[3], +m[2], +m[1]);
  // dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy (Australian day-first)
  const num = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g;
  while ((m = num.exec(line))) push(m, +m[1], +m[2], +m[3]);
  // 12 Aug 2026 / Mon 12 August / 12th Aug
  const dmy = new RegExp(`\\b${WD}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}(?:,?\\s+(\\d{4}))?`, 'gi');
  while ((m = dmy.exec(line))) push(m, +m[1], MONTHS[m[2].toLowerCase().replace('.', '')] ?? MONTHS[m[2].toLowerCase().slice(0, 3)], m[3] ? +m[3] : null);
  // Aug 12, 2026 / August 12
  const mdy = new RegExp(`\\b${WD}${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi');
  while ((m = mdy.exec(line))) push(m, +m[2], MONTHS[m[1].toLowerCase().replace('.', '')] ?? MONTHS[m[1].toLowerCase().slice(0, 3)], m[3] ? +m[3] : null);
  return out.sort((a, b) => a.index - b.index);
}

/** "12-16 Aug 2026", "12 – 16 August" — compact day ranges sharing a month. */
function findCompactRanges(line: string): { index: number; end: number; d1: number; d2: number; month: number; year: number | null }[] {
  const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}(?:,?\\s+(\\d{4}))?`, 'gi');
  const out = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const month = MONTHS[m[3].toLowerCase().replace('.', '')] ?? MONTHS[m[3].toLowerCase().slice(0, 3)];
    out.push({ index: m.index, end: m.index + m[0].length, d1: +m[1], d2: +m[2], month, year: m[4] ? +m[4] : null });
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function detectType(text: string): LeaveType | null {
  for (const r of TYPE_RULES) if (r.re.test(text)) return r.type;
  return null;
}

function detectStatus(text: string): LeaveStatus {
  if (DECLINED.test(text)) return 'declined';
  if (PENDING.test(text)) return 'pending';
  if (APPROVED.test(text)) return 'approved';
  return 'unknown';
}

export interface ParseLeaveOptions {
  /** Years the uploaded toll statements cover — used when a screenshot omits the year. */
  contextYears?: number[];
  today?: Date;
}

export function parseLeaveText(rawText: string, opts: ParseLeaveOptions = {}): LeaveCandidate[] {
  const text = normaliseOcr(rawText);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Year inference: explicit years in the screenshot win, then statement years, then today.
  const explicitYears = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]);
  const fallbackYear =
    mode(explicitYears) ?? mode(opts.contextYears ?? []) ?? (opts.today ?? new Date()).getFullYear();

  const raw: Omit<LeaveCandidate, 'id' | 'include'>[] = [];
  let lastType: { type: LeaveType; age: number } | null = null;

  lines.forEach((line, i) => {
    const lineType = detectType(line);
    if (lineType) lastType = { type: lineType, age: 0 };
    else if (lastType) lastType.age++;

    const ranges: { from: string; to: string; yearInferred: boolean }[] = [];
    const consumed: [number, number][] = [];

    for (const c of findCompactRanges(line)) {
      const y = c.year ?? fallbackYear;
      ranges.push({ from: toIso(y, c.month, c.d1), to: toIso(y, c.month, c.d2), yearInferred: c.year === null });
      consumed.push([c.index, c.end]);
    }

    const dates = findDates(line).filter((d) => !consumed.some(([a, b]) => d.index < b && d.end > a));
    // Drop "Submitted on 01/07/2026" style metadata dates
    const leaveDates = dates.filter((d) => !NOT_LEAVE_DATE.test(line.slice(0, d.index)));
    const resolved = leaveDates.map((d) => ({ ...d, iso: toIso(d.year ?? fallbackYear, d.month, d.day), yearInferred: d.year === null }));

    for (let k = 0; k < resolved.length; k++) {
      const a = resolved[k];
      const b = resolved[k + 1];
      const between = b ? line.slice(a.end, b.index) : '';
      const isRange = b && /^\s*(-|to|until|through|thru|till|→|–|>|,)?\s*$/i.test(between) && b.iso >= a.iso;
      if (isRange) {
        // If only the end date carried a year (e.g. "12 Aug - 16 Aug 2026"), apply it to the start too.
        const from = a.yearInferred && !b.yearInferred ? toIso(b.year!, a.month, a.day) : a.iso;
        ranges.push({ from, to: b.iso, yearInferred: b.yearInferred });
        k++;
      } else {
        ranges.push({ from: a.iso, to: a.iso, yearInferred: a.yearInferred });
      }
    }
    if (!ranges.length) return;

    // Context: this line plus its neighbours (card layouts put type/status on adjacent lines)
    const ctx = [lines[i - 1] ?? '', line, lines[i + 1] ?? ''].join(' ');
    let type = lineType;
    let typeGuessed = false;
    if (!type && lastType && lastType.age <= 2) type = lastType.type;
    if (!type) type = detectType(ctx);
    if (!type) {
      type = 'Annual';
      typeGuessed = true;
    }
    const status = detectStatus(line) !== 'unknown' ? detectStatus(line) : detectStatus(ctx);
    const partial = PARTIAL.test(line);

    for (const r of ranges) {
      const warnings: string[] = [];
      if (!isValid(parseISO(r.from)) || !isValid(parseISO(r.to))) continue;
      const span = differenceInCalendarDays(parseISO(r.to), parseISO(r.from)) + 1;
      if (span > 62) warnings.push(`Long range (${span} days) — check the dates were read correctly.`);
      if (r.yearInferred) warnings.push(`Year not shown — assumed ${fallbackYear}.`);
      if (typeGuessed) warnings.push('Leave type not found — assumed Annual.');
      if (status === 'pending') warnings.push('Still pending approval.');
      if (status === 'declined') warnings.push('Declined / cancelled — not added by default.');
      if (partial) warnings.push('Partial day — tolls stay claimable but are flagged for review.');
      raw.push({ from: r.from, to: r.to, type: type!, typeGuessed, status, partial, source: line, warnings });
    }
  });

  // De-duplicate identical ranges (OCR often repeats rows in summaries)
  const seen = new Set<string>();
  const out: LeaveCandidate[] = [];
  for (const r of raw) {
    const key = `${r.from}|${r.to}|${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, id: `lc_${out.length}_${key}`, include: r.status !== 'declined' && differenceInCalendarDays(parseISO(r.to), parseISO(r.from)) < 62 });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

export function expandRange(from: string, to: string): string[] {
  const out: string[] = [];
  let d = parseISO(from);
  const end = parseISO(to);
  if (!isValid(d) || !isValid(end)) return out;
  for (let i = 0; d <= end && i < 400; i++, d = addDays(d, 1)) out.push(format(d, 'yyyy-MM-dd'));
  return out;
}

function mode(xs: number[]): number | null {
  if (!xs.length) return null;
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Rebuild visual rows from word boxes. Tesseract's automatic layout often
 * reads tables column-by-column, which separates a leave type from its dates;
 * grouping words by vertical centre restores each table row as one line.
 */
export function wordsToRows(words: OcrWord[]): string {
  const ws = words.filter((w) => w.text.trim());
  if (!ws.length) return '';
  const heights = ws.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const h = heights[Math.floor(heights.length / 2)] || 10;
  const rows: { yc: number; words: OcrWord[] }[] = [];
  for (const w of [...ws].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)) {
    const yc = (w.y0 + w.y1) / 2;
    const row = rows.find((r) => Math.abs(r.yc - yc) <= h * 0.55);
    if (row) {
      row.words.push(w);
      row.yc = row.words.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / row.words.length;
    } else rows.push({ yc, words: [w] });
  }
  rows.sort((a, b) => a.yc - b.yc);
  return rows
    .map((r) => {
      const sorted = r.words.sort((a, b) => a.x0 - b.x0);
      let line = '';
      let prevEnd = -Infinity;
      for (const w of sorted) {
        const gap = w.x0 - prevEnd;
        line += line ? (gap > h * 1.6 ? '   ' : ' ') : '';
        line += w.text;
        prevEnd = w.x1;
      }
      return line;
    })
    .join('\n');
}
