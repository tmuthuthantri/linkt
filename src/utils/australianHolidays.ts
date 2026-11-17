import { addDays, format } from 'date-fns';
import type { HolidayRegion, PublicHoliday } from '../types';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Anonymous Gregorian computus — returns Easter Sunday. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** nth occurrence (1-based) of weekday in month (0-based month). n = -1 → last. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (n - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/** If date falls on a weekend, return the following Monday (or Tuesday when Monday is taken). */
function substitute(d: Date, taken: Set<string>): Date | null {
  const day = d.getDay();
  if (day !== 0 && day !== 6) return null;
  let s = addDays(d, day === 6 ? 2 : 1);
  while (taken.has(iso(s)) || s.getDay() === 0 || s.getDay() === 6) s = addDays(s, 1);
  return s;
}

/** Royal Queensland Show (Ekka) People's Day — Brisbane area. */
function ekkaWednesday(year: number): Date {
  // Show starts on the first Friday in August unless that is before 5 Aug, in which case the second Friday.
  let friday = nthWeekday(year, 7, 5, 1);
  if (friday.getDate() < 5) friday = addDays(friday, 7);
  return addDays(friday, 5);
}

const cache = new Map<string, PublicHoliday[]>();

export function getPublicHolidays(year: number, region: HolidayRegion): PublicHoliday[] {
  const key = `${year}-${region}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const list: PublicHoliday[] = [];
  const taken = new Set<string>();
  const add = (d: Date, name: string, r: HolidayRegion = 'National') => {
    const k = iso(d);
    if (taken.has(k)) return;
    taken.add(k);
    list.push({ date: k, name, region: r });
  };
  const addWithSub = (d: Date, name: string, r: HolidayRegion = 'National') => {
    add(d, name, r);
    const s = substitute(d, taken);
    if (s) add(s, `${name} (substitute)`, r);
  };

  const easter = easterSunday(year);
  addWithSub(new Date(year, 0, 1), "New Year's Day");
  addWithSub(new Date(year, 0, 26), 'Australia Day');
  add(addDays(easter, -2), 'Good Friday');
  add(addDays(easter, 1), 'Easter Monday');
  add(new Date(year, 3, 25), 'Anzac Day');

  const christmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  add(christmas, 'Christmas Day');
  add(boxing, 'Boxing Day');
  // Christmas/Boxing substitutes (handled together so they don't collide)
  if (christmas.getDay() === 6) {
    add(new Date(year, 11, 27), 'Christmas Day (substitute)');
    add(new Date(year, 11, 28), 'Boxing Day (substitute)');
  } else if (christmas.getDay() === 5) {
    add(new Date(year, 11, 28), 'Boxing Day (substitute)');
  } else if (christmas.getDay() === 0) {
    add(new Date(year, 11, 27), 'Christmas Day (substitute)');
  }

  if (region === 'QLD') {
    add(addDays(easter, -1), 'Easter Saturday', 'QLD');
    add(easter, 'Easter Sunday', 'QLD');
    add(nthWeekday(year, 4, 1, 1), 'Labour Day', 'QLD');
    add(ekkaWednesday(year), 'Royal Queensland Show (Brisbane)', 'QLD');
    add(nthWeekday(year, 9, 1, 1), "King's Birthday", 'QLD');
  } else if (region === 'NSW') {
    add(addDays(easter, -1), 'Easter Saturday', 'NSW');
    add(easter, 'Easter Sunday', 'NSW');
    add(nthWeekday(year, 5, 1, 2), "King's Birthday", 'NSW');
    add(nthWeekday(year, 9, 1, 1), 'Labour Day', 'NSW');
  } else if (region === 'VIC') {
    add(addDays(easter, -1), 'Easter Saturday', 'VIC');
    add(easter, 'Easter Sunday', 'VIC');
    add(nthWeekday(year, 2, 1, 2), 'Labour Day', 'VIC');
    add(nthWeekday(year, 5, 1, 2), "King's Birthday", 'VIC');
    // AFL Grand Final Friday — typically the Friday before the last Saturday in September.
    add(addDays(nthWeekday(year, 8, 6, -1), -1), 'Friday before AFL Grand Final', 'VIC');
    add(nthWeekday(year, 10, 2, 1), 'Melbourne Cup Day', 'VIC');
  } else {
    add(nthWeekday(year, 5, 1, 2), "King's Birthday");
  }

  list.sort((a, b) => a.date.localeCompare(b.date));
  cache.set(key, list);
  return list;
}

export function buildHolidayIndex(
  years: number[],
  region: HolidayRegion,
  custom: PublicHoliday[],
): Map<string, PublicHoliday> {
  const map = new Map<string, PublicHoliday>();
  for (const y of years) for (const h of getPublicHolidays(y, region)) map.set(h.date, h);
  for (const h of custom) map.set(h.date, h);
  return map;
}
