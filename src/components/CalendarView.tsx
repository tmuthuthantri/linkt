import { useEffect, useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Ban, Building2, CalendarOff, Check, ChevronLeft, ChevronRight, FileSearch, FileUp, Undo2 } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { useAnalysis } from '../hooks/useAnalysis';
import { makeDayContextResolver } from '../utils/tollDetectionEngine';
import { fmtDate, money } from '../utils/format';
import { Badge, ConfidenceBadge, EmptyState, StatusPill, cx } from './ui';
import { DayBadge } from './TransactionsView';

export default function CalendarView() {
  const { days } = useAnalysis();
  const settings = useTollStore((s) => s.settings);
  const setIncluded = useTollStore((s) => s.setIncluded);
  const selectTxn = useTollStore((s) => s.selectTxn);
  const setView = useTollStore((s) => s.setView);
  const openModal = useTollStore((s) => s.openModal);
  const setLeaveImportOpen = useTollStore((s) => s.setLeaveImportOpen);
  const leaveByDate = useMemo(() => new Map(settings.leaveDates.map((l) => [l.date, l])), [settings.leaveDates]);

  const months = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(), [days]);
  const [month, setMonth] = useState<string>(() => months[0] ?? format(new Date(), 'yyyy-MM'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    if (months.length && !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const dayMap = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const monthDate = parseISO(`${month}-01`);
  const grid = eachDayOfInterval({ start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }) });
  const resolve = useMemo(() => makeDayContextResolver(settings, [monthDate.getFullYear() - 1, monthDate.getFullYear(), monthDate.getFullYear() + 1]), [settings, month]);

  if (!days.length) {
    return (
      <EmptyState
        icon={<FileUp className="h-8 w-8" />}
        title="Nothing on the calendar yet"
        body="Once you upload a statement, every day with tolls appears here colour-coded by claim status."
        actions={<button className="btn-primary" onClick={() => openModal('upload')}><FileUp className="h-4 w-4" /> Upload statements</button>}
      />
    );
  }

  const sel = selectedDate ? dayMap.get(selectedDate) : null;
  const selCtx = selectedDate ? resolve(selectedDate) : null;
  const monthDays = days.filter((d) => d.date.startsWith(month));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          <button className="btn-secondary btn-sm" onClick={() => setLeaveImportOpen(true)}>
            <CalendarOff className="h-3.5 w-3.5" /> Import leave screenshot
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {months.map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-medium',
                m === month ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
              )}
            >
              {format(parseISO(`${m}-01`), 'MMM yyyy')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <button className="btn-ghost p-1.5!" onClick={() => setMonth(format(addMonths(monthDate, -1), 'yyyy-MM'))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-center">
              <div className="font-semibold">{format(monthDate, 'MMMM yyyy')}</div>
              <div className="num text-xs text-slate-500">
                {money(monthDays.reduce((s, d) => s + d.claimedTotal, 0))} claimed · {monthDays.filter((d) => d.claimedCount).length} days
              </div>
            </div>
            <button className="btn-ghost p-1.5!" onClick={() => setMonth(format(addMonths(monthDate, 1), 'yyyy-MM'))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((date) => {
              const iso = format(date, 'yyyy-MM-dd');
              const d = dayMap.get(iso);
              const ctx = resolve(iso);
              const inMonth = isSameMonth(date, monthDate);
              const offDay = ctx.dayType === 'leave' || ctx.dayType === 'public-holiday';
              const state = d ? (d.reviewCount ? 'review' : d.claimedCount ? 'claimed' : 'pending') : null;
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  className={cx(
                    'relative flex min-h-[78px] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[92px]',
                    !inMonth && 'opacity-40',
                    selectedDate === iso ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 dark:border-slate-800',
                    state === 'claimed' && 'bg-emerald-50 dark:bg-emerald-500/10',
                    state === 'review' && 'bg-amber-50 dark:bg-amber-500/10',
                    state === 'pending' && 'bg-slate-50 dark:bg-slate-800/40',
                    !state && offDay && 'bg-rose-50/60 dark:bg-rose-500/5',
                    !state && !offDay && 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cx('num text-xs font-semibold', ctx.isWorkDay ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>{format(date, 'd')}</span>
                    {ctx.isWorkDay && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Rostered work day" />}
                  </div>
                  {offDay && (
                    <span className="mt-0.5 truncate text-[10px] text-rose-600 dark:text-rose-400">
                      {ctx.dayType === 'leave' ? leaveByDate.get(iso)?.type ?? 'Leave' : 'Holiday'}
                    </span>
                  )}
                  {ctx.partialLeave && <span className="mt-0.5 truncate text-[10px] text-orange-600 dark:text-orange-400">½ {leaveByDate.get(iso)?.type ?? 'leave'}</span>}
                  {d && (
                    <div className="mt-auto">
                      {d.likelyOfficeAttendance && <Building2 className="mb-0.5 h-3 w-3 text-emerald-600" />}
                      <div className={cx('num text-[11px] font-semibold', state === 'claimed' ? 'text-emerald-700 dark:text-emerald-400' : state === 'review' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500')}>
                        {money(d.claimedCount ? d.claimedTotal : d.total)}
                      </div>
                      <div className="text-[10px] text-slate-500">{d.transactions.length} toll{d.transactions.length === 1 ? '' : 's'}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <Key cls="bg-emerald-100 dark:bg-emerald-500/20" label="Claimed" />
            <Key cls="bg-slate-100 dark:bg-slate-800" label="Pending toll (not claimed)" />
            <Key cls="bg-amber-100 dark:bg-amber-500/20" label="Requires review" />
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Rostered work day</span>
            <Key cls="bg-rose-100 dark:bg-rose-500/20" label="Leave / holiday" />
          </div>
        </div>

        {/* Side panel */}
        <aside className="card flex min-h-[300px] flex-col p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-100px)]">
          {!selectedDate ? (
            <div className="m-auto text-center text-sm text-slate-500">Select a day to see its tolls and make claim decisions.</div>
          ) : (
            <>
              <div className="mb-3">
                <div className="font-semibold">{fmtDate(selectedDate, 'EEEE d MMMM yyyy')}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selCtx && <DayBadge dayType={selCtx.dayType} label={selCtx.label} />}
                  {sel?.likelyOfficeAttendance && <Badge tone="emerald"><Building2 className="h-3 w-3" /> Likely Office Attendance</Badge>}
                </div>
                {selCtx && <p className="mt-1 text-xs text-slate-500">{selCtx.label}</p>}
              </div>
              {!sel ? (
                <div className="m-auto text-center text-sm text-slate-500">No tolls recorded on this day.</div>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <button className="btn-success btn-sm" onClick={() => setIncluded(sel.transactions.map((t) => t.id), true, `Claim day ${fmtDate(sel.date, 'd MMM')}`)}>
                      <Check className="h-3.5 w-3.5" /> Claim whole day
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => setIncluded(sel.transactions.map((t) => t.id), false, `Exclude day ${fmtDate(sel.date, 'd MMM')}`)}>
                      <Ban className="h-3.5 w-3.5" /> Exclude day
                    </button>
                  </div>
                  <ul className="scroll-thin -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
                    {sel.transactions.map((t) => (
                      <li key={t.id} className={cx('rounded-lg border p-2.5', t.status === 'included' ? 'border-emerald-300 dark:border-emerald-500/30' : 'border-slate-200 dark:border-slate-800')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{t.tollPoint}</div>
                            <div className="num text-xs text-slate-500">{t.time} · <span className="capitalize">{t.tripRole === 'other' ? 'other trip' : t.tripRole}</span></div>
                          </div>
                          <span className="num text-sm font-semibold">{money(t.amount)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <ConfidenceBadge value={t.confidence} manual={t.manual} />
                          <StatusPill status={t.status} manual={t.manual} />
                          <div className="ml-auto flex gap-0.5">
                            {t.status !== 'included' && <button className="btn-ghost btn-sm text-emerald-700! dark:text-emerald-400!" onClick={() => setIncluded([t.id], true)}><Check className="h-3.5 w-3.5" /> Claim</button>}
                            {t.status !== 'excluded' && <button className="btn-ghost btn-sm" onClick={() => setIncluded([t.id], false)}><Ban className="h-3.5 w-3.5" /> Exclude</button>}
                            {t.manual && <button className="btn-ghost btn-sm" title="Revert to AI decision" aria-label="Revert to AI decision" onClick={() => setIncluded([t.id], undefined)}><Undo2 className="h-3.5 w-3.5" /></button>}
                            <button className="btn-ghost btn-sm" title="Show on PDF" aria-label="Show on PDF" onClick={() => { selectTxn(t.id); setView('split'); }}><FileSearch className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                    <span className="text-slate-500">Claiming</span>
                    <span className="num font-semibold text-emerald-700 dark:text-emerald-400">{money(sel.claimedTotal)} <span className="font-normal text-slate-500">/ {money(sel.total)}</span></span>
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Key({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-3 w-3 rounded', cls)} />
      {label}
    </span>
  );
}
