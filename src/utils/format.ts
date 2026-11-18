import { format, parseISO } from 'date-fns';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const gstOf = (amountIncGst: number) => round2(amountIncGst / 11);

export const money = (n: number, withCode = false) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${withCode ? ' AUD' : ''}`;

export const fmtDate = (isoDate: string, pattern = 'EEE d MMM yyyy') => {
  try {
    return format(parseISO(isoDate), pattern);
  } catch {
    return isoDate;
  }
};

export const toMinutes = (hhmm: string) => {
  const [h, m, s] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0) + (s || 0) / 60;
};

export const fromMinutes = (mins: number) => {
  const m = Math.round(mins);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${suffix}`;
};

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClaudeDownloads = { save: (r: { filename: string; data: Blob }) => Promise<{ status: string }> } | null;
let claudeDownloads: Promise<ClaudeDownloads> | null = null;

/**
 * When the app runs as a claude.ai artifact, page-initiated downloads are blocked and
 * files must go through the viewer's `downloads` capability (a save confirmation).
 * Called once at startup so the capability is ready by the time the user clicks.
 */
export function initHostDownloads() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (window as any).claude;
  if (!claudeDownloads && c && typeof c.use === 'function') {
    claudeDownloads = Promise.resolve(c.use('downloads')).catch(() => null) as Promise<ClaudeDownloads>;
  }
}

/** Save a generated file. Rejects with a readable message if the viewer declines. */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const host = claudeDownloads ? await claudeDownloads : null;
  if (host) {
    try {
      await host.save({ filename: fileName, data: blob });
      return;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') throw new Error('Download cancelled.');
      if (code === 'rate_limited') throw new Error('A save prompt is already open — finish it, then try again.');
      if (code && code !== 'unavailable' && code !== 'not_granted') throw new Error(`Could not save the file (${code}).`);
      // unavailable → fall through to a normal browser download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSafe = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

/** Absolute URL for a file in public/, valid whether the app is hosted at a root or a sub-path (base: './'). */
export const assetUrl = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
