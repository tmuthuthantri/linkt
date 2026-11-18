import { differenceInCalendarWeeks, getISOWeek, parseISO } from 'date-fns';
import type {
  AnalysedTransaction,
  ClaimStatus,
  DailyTripGroup,
  DayType,
  LearnedCommuteHabits,
  RosterPattern,
  TollTransaction,
  TransactionOverride,
  TripRole,
  TripSegment,
  UserSettings,
} from '../types';
import { buildHolidayIndex } from './australianHolidays';
import { fromMinutes, round2, toMinutes, WEEKDAYS } from './format';

export interface DayContext {
  date: string;
  weekday: number;
  dayType: DayType;
  label: string;
  isWorkDay: boolean;
  partialLeave?: string;
  windows: { morningStart: number; morningEnd: number; eveningStart: number; eveningEnd: number };
}

export interface AnalysisResult {
  transactions: AnalysedTransaction[];
  byId: Map<string, AnalysedTransaction>;
  days: DailyTripGroup[];
  habits: LearnedCommuteHabits;
}

export const ROSTER_PRESETS: RosterPattern[] = [
  { id: 'roster-ft', name: 'Full Time (Mon–Fri)', type: 'full-time', weekdays: [1, 2, 3, 4, 5] },
  { id: 'roster-hybrid', name: 'Hybrid 3-Day (Tue–Thu in office)', type: 'hybrid', weekdays: [2, 3, 4] },
  { id: 'roster-9df', name: '9-Day Fortnight (alternate Friday RDO)', type: 'nine-day-fortnight', weekdays: [1, 2, 3, 4, 5], rdoWeekday: 5 },
  { id: 'roster-custom', name: 'Custom', type: 'custom', weekdays: [1, 3, 5] },
];

function isSaturdayRostered(date: string, s: UserSettings['saturday']): boolean {
  if (!s.enabled) return false;
  switch (s.rotation) {
    case 'every':
      return true;
    case 'fortnightly-even':
      return getISOWeek(parseISO(date)) % 2 === 0;
    case 'fortnightly-odd':
      return getISOWeek(parseISO(date)) % 2 === 1;
    case 'custom':
      return s.customDates.includes(date);
  }
}

export function makeDayContextResolver(settings: UserSettings, years: number[]) {
  const holidays = buildHolidayIndex(years, settings.holidayRegion, settings.customHolidays);
  const leave = new Map(settings.leaveDates.map((l) => [l.date, l]));
  const oneOff = new Map(settings.oneOffWorkDays.map((o) => [o.date, o]));
  const roster = settings.rosterPatterns.find((r) => r.id === settings.activeRosterId) ?? settings.rosterPatterns[0];
  const c = settings.commute;
  const s = settings.saturday;
  const weekdayWindows = {
    morningStart: toMinutes(c.morningStart),
    morningEnd: toMinutes(c.morningEnd),
    eveningStart: toMinutes(c.eveningStart),
    eveningEnd: toMinutes(c.eveningEnd),
  };
  const satWindows = {
    morningStart: toMinutes(s.morningStart),
    morningEnd: toMinutes(s.morningEnd),
    eveningStart: toMinutes(s.eveningStart),
    eveningEnd: toMinutes(s.eveningEnd),
  };

  const resolveFull = (date: string): DayContext => {
    const d = parseISO(date);
    const weekday = d.getDay();
    const windows = weekday === 6 && s.enabled ? satWindows : weekdayWindows;
    const base = { date, weekday, windows };
    const off = oneOff.get(date);
    if (off) return { ...base, dayType: 'one-off-work', label: off.note ? `One-off work day — ${off.note}` : 'One-off work day', isWorkDay: true };
    const lv = leave.get(date);
    if (lv && !lv.partial) return { ...base, dayType: 'leave', label: `${lv.type} leave${lv.note ? ` — ${lv.note}` : ''}`, isWorkDay: false };
    const hol = holidays.get(date);
    if (hol) return { ...base, dayType: 'public-holiday', label: `Public holiday — ${hol.name}`, isWorkDay: false };
    if (weekday === 6 && isSaturdayRostered(date, s)) return { ...base, dayType: 'saturday-roster', label: `Rostered Saturday shift (${s.shiftStart}–${s.shiftEnd})`, isWorkDay: true };
    if (roster?.weekdays.includes(weekday)) {
      if (roster.type === 'nine-day-fortnight' && roster.rdoWeekday === weekday && roster.rdoAnchorDate) {
        const weeks = differenceInCalendarWeeks(d, parseISO(roster.rdoAnchorDate), { weekStartsOn: 1 });
        if (Math.abs(weeks) % 2 === 0) return { ...base, dayType: 'leave', label: 'Rostered day off (9-day fortnight RDO)', isWorkDay: false };
      }
      return { ...base, dayType: 'rostered', label: `Rostered work day (${roster.name})`, isWorkDay: true };
    }
    if (weekday === 0 || weekday === 6) return { ...base, dayType: 'weekend', label: 'Weekend — not rostered', isWorkDay: false };
    return { ...base, dayType: 'non-rostered', label: `Not rostered under ${roster?.name ?? 'roster'}`, isWorkDay: false };
  };

  return (date: string): DayContext => {
    const ctx = resolveFull(date);
    const lv = leave.get(date);
    if (lv?.partial && ctx.dayType !== 'one-off-work') {
      const what = `half-day ${lv.type.toLowerCase()} leave${lv.note ? ` — ${lv.note}` : ''}`;
      if (ctx.isWorkDay) return { ...ctx, label: `${ctx.label} with ${what}`, partialLeave: what };
      return ctx;
    }
    return ctx;
  };
}

function windowDistance(mins: number, start: number, end: number) {
  if (mins >= start && mins <= end) return 0;
  return mins < start ? start - mins : mins - end;
}

function normPlate(s: string | null | undefined) {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function buildTrips(txns: TollTransaction[], gapMinutes: number): TollTransaction[][] {
  const sorted = [...txns].sort((a, b) => a.time.localeCompare(b.time));
  const trips: TollTransaction[][] = [];
  for (const t of sorted) {
    const last = trips[trips.length - 1];
    if (last && toMinutes(t.time) - toMinutes(last[last.length - 1].time) <= gapMinutes) last.push(t);
    else trips.push([t]);
  }
  return trips;
}

export function analyseTransactions(
  transactions: TollTransaction[],
  overrides: Record<string, TransactionOverride>,
  settings: UserSettings,
): AnalysisResult {
  const years = [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))];
  const resolve = makeDayContextResolver(settings, years.length ? years : [new Date().getFullYear()]);

  // frequency of toll points — learned "usual commute points"
  const pointFreq = new Map<string, number>();
  for (const t of transactions) pointFreq.set(t.tollPoint, (pointFreq.get(t.tollPoint) ?? 0) + 1);
  const freqThreshold = Math.max(3, Math.ceil(transactions.length * 0.08));

  const registryPlates = new Set(settings.vehicles.map((v) => normPlate(v.plate)).filter(Boolean));
  const registryTags = new Map(settings.tags.map((t) => [t.tagNumber.replace(/\D/g, ''), t]));
  for (const t of settings.tags) if (t.plate) registryPlates.add(normPlate(t.plate));
  const hasRegistry = registryPlates.size > 0 || registryTags.size > 0;

  const byDate = new Map<string, TollTransaction[]>();
  for (const t of transactions) {
    const arr = byDate.get(t.date) ?? [];
    arr.push(t);
    byDate.set(t.date, arr);
  }

  const analysed: AnalysedTransaction[] = [];
  const days: DailyTripGroup[] = [];

  for (const [date, list] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ctx = resolve(date);
    const w = ctx.windows;
    const rawTrips = buildTrips(list, settings.commute.tripGapMinutes);
    const trips: TripSegment[] = rawTrips.map((trip, i) => {
      const startMins = toMinutes(trip[0].time);
      let role: TripRole = 'other';
      if (windowDistance(startMins, w.morningStart, w.morningEnd) === 0) role = 'morning';
      else if (windowDistance(startMins, w.eveningStart, w.eveningEnd) === 0) role = 'evening';
      return {
        id: `${date}-trip-${i + 1}`,
        date,
        start: trip[0].time,
        end: trip[trip.length - 1].time,
        role,
        transactionIds: trip.map((t) => t.id),
        total: round2(trip.reduce((s, t) => s + t.amount, 0)),
      };
    });
    const hasMorning = trips.some((t) => t.role === 'morning');
    const hasEvening = trips.some((t) => t.role === 'evening');
    const paired = hasMorning && hasEvening;
    const dayTxns: AnalysedTransaction[] = [];

    for (const trip of trips) {
      const startMins = toMinutes(trip.start);
      for (const id of trip.transactionIds) {
        const t = list.find((x) => x.id === id)!;
        const reasons: string[] = [];
        let confidence: number;
        const frequent = (pointFreq.get(t.tollPoint) ?? 0) >= freqThreshold;

        let vehicleRegistered: boolean | null = null;
        if (hasRegistry) {
          vehicleRegistered =
            (!!t.tagNumber && registryTags.has(t.tagNumber.replace(/\D/g, ''))) ||
            (!!t.vehicleRego && registryPlates.has(normPlate(t.vehicleRego)));
        }

        const winLabel = trip.role === 'morning'
          ? `morning commute window (${fromMinutes(w.morningStart)}–${fromMinutes(w.morningEnd)})`
          : `evening return window (${fromMinutes(w.eveningStart)}–${fromMinutes(w.eveningEnd)})`;

        if (ctx.isWorkDay) {
          reasons.push(`${ctx.label}.`);
          if (trip.role !== 'other' && paired) {
            confidence = 95;
            reasons.push(`Trip starting ${trip.start.slice(0, 5)} falls in the ${winLabel}, and a matching ${trip.role === 'morning' ? 'evening return' : 'morning departure'} was found the same day.`);
            if (frequent) {
              confidence += 2;
              reasons.push(`${t.tollPoint} is one of your regular commute toll points.`);
            }
            const mid = trip.role === 'morning' ? (w.morningStart + w.morningEnd) / 2 : (w.eveningStart + w.eveningEnd) / 2;
            const half = trip.role === 'morning' ? (w.morningEnd - w.morningStart) / 2 : (w.eveningEnd - w.eveningStart) / 2;
            if (Math.abs(startMins - mid) <= half / 2) confidence += 1;
            if (vehicleRegistered) confidence += 1;
            confidence = Math.min(99, confidence);
          } else if (trip.role !== 'other') {
            confidence = 86;
            reasons.push(`Trip starting ${trip.start.slice(0, 5)} falls in the ${winLabel}, but no ${trip.role === 'morning' ? 'evening return' : 'morning departure'} toll was found that day (un-paired trip).`);
            if (frequent) {
              confidence += 4;
              reasons.push(`${t.tollPoint} is one of your regular commute toll points.`);
            }
            if (vehicleRegistered) confidence += 2;
            confidence = Math.min(94, confidence);
          } else {
            const d = Math.min(
              windowDistance(startMins, w.morningStart, w.morningEnd),
              windowDistance(startMins, w.eveningStart, w.eveningEnd),
            );
            confidence = Math.max(50, Math.round(79 - d / 6));
            reasons.push(`Travel at ${trip.start.slice(0, 5)} is ${Math.round(d)} min outside your usual commute windows — could be a client visit, early start or late finish.`);
            if (paired) {
              confidence = Math.min(79, confidence + 5);
              reasons.push('You also commuted normally this day, so this may be an additional work trip.');
            }
          }
        } else {
          const baseByType: Partial<Record<DayType, number>> = { 'public-holiday': 12, leave: 18, weekend: 22, 'non-rostered': 35 };
          confidence = baseByType[ctx.dayType] ?? 30;
          reasons.push(`${ctx.label} — not a rostered work day.`);
          if (trip.role !== 'other') {
            confidence += 10;
            reasons.push(`Timing (${trip.start.slice(0, 5)}) resembles a commute; add a one-off work day in Settings if you worked.`);
          }
          confidence = Math.min(49, confidence);
        }

        if (ctx.partialLeave && confidence > 85) {
          confidence = 85;
          reasons.push(`You had ${ctx.partialLeave} this day — only one leg may be work travel, so this needs your review.`);
        }

        if (vehicleRegistered === false) {
          confidence = Math.max(0, confidence - 25);
          reasons.push(`Vehicle/tag ${t.tagNumber ?? t.vehicleRego ?? 'unknown'} is not in your registered work vehicles or tags.`);
        }

        let aiStatus: ClaimStatus;
        if (confidence >= 95 && settings.autoSelectHighConfidence) aiStatus = 'included';
        else if (confidence >= 50) aiStatus = 'review';
        else aiStatus = 'excluded';

        const ov = overrides[t.id];
        const manual = ov?.included !== undefined;
        const status: ClaimStatus = manual ? (ov!.included ? 'included' : 'excluded') : aiStatus;
        const finalConfidence = manual ? 100 : confidence;
        if (manual) reasons.unshift(`Manually ${ov!.included ? 'selected for claim' : 'excluded'} by you (AI score was ${confidence}%).`);

        const summary = manual
          ? ov!.included ? 'Manually selected' : 'Manually excluded'
          : confidence >= 95
            ? 'Rostered day · full commute pattern'
            : confidence >= 80
              ? 'Rostered day · single commute leg'
              : confidence >= 50
                ? 'Work day · unusual travel time'
                : 'Outside roster / leave / holiday';

        dayTxns.push({
          ...t,
          confidence: finalConfidence,
          status,
          aiStatus,
          aiRecommended: confidence >= 80,
          reasons,
          summary,
          dayType: ctx.dayType,
          dayLabel: ctx.label,
          isWorkDay: ctx.isWorkDay,
          tripRole: trip.role,
          tripId: trip.id,
          manual,
          vehicleRegistered,
          notes: ov?.notes ?? '',
        });
      }
    }

    dayTxns.sort((a, b) => a.time.localeCompare(b.time));
    analysed.push(...dayTxns);
    const claimed = dayTxns.filter((t) => t.status === 'included');
    days.push({
      date,
      weekday: ctx.weekday,
      dayType: ctx.dayType,
      dayLabel: ctx.label,
      isWorkDay: ctx.isWorkDay,
      likelyOfficeAttendance: ctx.isWorkDay && paired,
      transactions: dayTxns,
      trips,
      total: round2(dayTxns.reduce((s, t) => s + t.amount, 0)),
      gst: round2(dayTxns.reduce((s, t) => s + t.gst, 0)),
      claimedTotal: round2(claimed.reduce((s, t) => s + t.amount, 0)),
      claimedCount: claimed.length,
      reviewCount: dayTxns.filter((t) => t.status === 'review').length,
      paired,
    });
  }

  analysed.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { transactions: analysed, byId: new Map(analysed.map((t) => [t.id, t])), days, habits: learnHabits(transactions, days) };
}

export function learnHabits(transactions: TollTransaction[], days: DailyTripGroup[]): LearnedCommuteHabits {
  const weekdayCounts = new Array(7).fill(0) as number[];
  for (const d of days) if (d.trips.length) weekdayCounts[d.weekday]++;
  const commonWorkDays = weekdayCounts
    .map((count, weekday) => ({ weekday, label: WEEKDAYS[weekday], count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const roads = new Map<string, { count: number; spend: number }>();
  const points = new Map<string, number>();
  for (const t of transactions) {
    const r = roads.get(t.road) ?? { count: 0, spend: 0 };
    r.count++;
    r.spend = round2(r.spend + t.amount);
    roads.set(t.road, r);
    points.set(t.tollPoint, (points.get(t.tollPoint) ?? 0) + 1);
  }

  const mornings: number[] = [];
  const evenings: number[] = [];
  for (const d of days) {
    const am = d.trips.filter((t) => toMinutes(t.start) < 12 * 60);
    const pm = d.trips.filter((t) => toMinutes(t.start) >= 12 * 60);
    if (am.length) mornings.push(toMinutes(am[0].start));
    if (pm.length) evenings.push(toMinutes(pm[pm.length - 1].start));
  }
  const avg = (xs: number[]) => (xs.length ? fromMinutes(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const tripDays = days.filter((d) => d.trips.length).length;
  const pairedDays = days.filter((d) => d.paired).length;

  return {
    commonWorkDays,
    topRoads: [...roads.entries()].map(([road, v]) => ({ road, ...v })).sort((a, b) => b.spend - a.spend),
    topTollPoints: [...points.entries()].map(([tollPoint, count]) => ({ tollPoint, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    avgMorningDeparture: avg(mornings),
    avgEveningReturn: avg(evenings),
    pairingRate: tripDays ? pairedDays / tripDays : 0,
    tripDays,
    pairedDays,
  };
}

export function confidenceTone(c: number): 'high' | 'medium' | 'low' | 'none' {
  if (c >= 95) return 'high';
  if (c >= 80) return 'medium';
  if (c >= 50) return 'low';
  return 'none';
}
