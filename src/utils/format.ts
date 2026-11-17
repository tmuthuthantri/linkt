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

export function downloadBlob(blob: Blob, fileName: string) {
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
