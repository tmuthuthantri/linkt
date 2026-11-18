import { useMemo } from 'react';
import {
  AlertTriangle,
  Brain,
  Building2,
  CalendarCheck,
  CalendarOff,
  CircleDollarSign,
  Clock,
  FileUp,
  Gauge,
  ListChecks,
  Receipt,
  Route,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTollStore } from '../store/useTollStore';
import { useAnalysis } from '../hooks/useAnalysis';
import { fmtDate, money, to12h, WEEKDAYS_SHORT } from '../utils/format';
import { Badge, SectionTitle, cx } from './ui';
import WelcomeView from './WelcomeView';

export default function DashboardView() {
  const hasData = useTollStore((s) => s.transactions.length > 0);
  const openModal = useTollStore((s) => s.openModal);
  const setView = useTollStore((s) => s.setView);
  const theme = useTollStore((s) => s.settings.theme);
  const statements = useTollStore((s) => s.statements);
  const profileName = useTollStore((s) => s.settings.profile.employeeName);
  const { totals, days, habits, transactions } = useAnalysis();

  const dailyData = useMemo(
    () =>
      days.map((d) => ({
        date: fmtDate(d.date, 'd MMM'),
        Claimed: d.claimedTotal,
        Review: Math.round(d.transactions.filter((t) => t.status === 'review').reduce((s, t) => s + t.amount, 0) * 100) / 100,
        Excluded: Math.round(d.transactions.filter((t) => t.status === 'excluded').reduce((s, t) => s + t.amount, 0) * 100) / 100,
      })),
    [days],
  );
  const roadData = useMemo(() => {
    const m = new Map<string, { road: string; Claimed: number; Other: number }>();
    for (const t of transactions) {
      const r = m.get(t.road) ?? { road: t.road, Claimed: 0, Other: 0 };
      if (t.status === 'included') r.Claimed = Math.round((r.Claimed + t.amount) * 100) / 100;
      else r.Other = Math.round((r.Other + t.amount) * 100) / 100;
      m.set(t.road, r);
    }
    return [...m.values()].sort((a, b) => b.Claimed + b.Other - (a.Claimed + a.Other));
  }, [transactions]);

  if (!hasData) return <WelcomeView />;

  // Chart tokens follow the slate palette in index.css.
  const axis = theme === 'dark' ? '#95a3a9' : '#5d6b72';
  const grid = theme === 'dark' ? '#2c3c44' : '#dde4e7';
  const surface = theme === 'dark' ? '#1f3038' : '#ffffff';
  const C = theme === 'dark'
    ? { claimed: '#34d399', review: '#fbbf24', excluded: '#4a5960', other: '#3a4a52' }
    : { claimed: '#059669', review: '#f59e0b', excluded: '#c5cfd3', other: '#c5cfd3' };
  const reviewCount = transactions.filter((t) => t.status === 'review').length;
  const period = statements
    .flatMap((s) => [s.periodStart, s.periodEnd])
    .filter(Boolean)
    .sort() as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{profileName ? `${profileName.split(' ')[0]}'s toll claim` : 'Toll claim overview'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {statements.length} statement{statements.length === 1 ? '' : 's'}
            {period.length ? ` · ${fmtDate(period[0], 'd MMM yyyy')} – ${fmtDate(period[period.length - 1], 'd MMM yyyy')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviewCount > 0 && (
            <button className="btn-secondary" onClick={() => setView('transactions')}>
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Review {reviewCount} tolls
            </button>
          )}
          <button className="btn-secondary" onClick={() => useTollStore.getState().setLeaveImportOpen(true)}>
            <CalendarOff className="h-4 w-4" /> Import leave
          </button>
          <button className="btn-secondary" onClick={() => setView('split')}>
            Inspect on PDF
          </button>
          <button className="btn-success" onClick={() => openModal('export')}>
            Export claim package
          </button>
        </div>
      </div>

      {/* Hero + KPI grid */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="card relative overflow-hidden p-5 lg:row-span-2">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-blue-600" />
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <CircleDollarSign className="h-4 w-4 text-emerald-600" /> Total claim amount
          </div>
          <div className="num mt-3 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">{money(totals.claimAmount)}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">AUD incl. GST</div>
          <dl className="mt-5 space-y-2 text-sm">
            <Row label="GST component (1/11th)" value={money(totals.claimGst, true)} />
            <Row label="Amount ex GST" value={money(totals.claimAmount - totals.claimGst, true)} />
            <Row label="Claimable tolls" value={`${totals.claimCount} of ${totals.totalCount}`} />
            <Row label="Statement total" value={money(totals.totalAmount, true)} />
          </dl>
          <div className="mt-5">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Share of statement claimed</span>
              <span className="num">{totals.totalAmount ? Math.round((totals.claimAmount / totals.totalAmount) * 100) : 0}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${totals.totalAmount ? (totals.claimAmount / totals.totalAmount) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        <Kpi icon={ListChecks} label="Claimable tolls" value={String(totals.claimCount)} hint={`${money(totals.claimAmount)} selected`} />
        <Kpi icon={Receipt} label="Total transactions" value={String(totals.totalCount)} hint={`${money(totals.totalAmount)} across statements`} />
        <Kpi icon={Building2} label="Work days detected" value={String(totals.workDays)} hint={`${totals.officeDays} likely office attendance`} />
        <Kpi icon={Gauge} label="Average daily cost" value={money(totals.avgDailyCost)} hint="per claimed day" />
        <Kpi
          icon={TrendingUp}
          label="Highest cost day"
          value={totals.highestDay ? money(totals.highestDay.amount) : '—'}
          hint={totals.highestDay ? fmtDate(totals.highestDay.date) : 'No claimed days yet'}
        />
        <Kpi
          icon={Clock}
          label="Days awaiting review"
          value={String(totals.daysAwaitingReview)}
          hint={totals.daysAwaitingReview ? 'Amber items need a decision' : 'All decisions made'}
          tone={totals.daysAwaitingReview ? 'amber' : 'emerald'}
          onClick={() => setView('calendar')}
        />
      </div>

      {totals.potentialMissing.count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <Sparkles className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-amber-900 dark:text-amber-200">Potential missing claims: {totals.potentialMissing.count} tolls ({money(totals.potentialMissing.amount)})</span>
            <span className="text-amber-800 dark:text-amber-300/80"> — rostered-day trips that match your commute but aren't selected yet.</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setView('transactions')}>
            Review now
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card flex flex-col p-5 xl:col-span-2">
          <SectionTitle right={<span className="text-xs text-slate-500">AUD per day</span>}>Daily toll spend</SectionTitle>
          <div className="h-72 min-h-72 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: grid }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  cursor={{ fill: theme === 'dark' ? 'rgba(148,163,184,.08)' : 'rgba(15,23,42,.04)' }}
                  contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}
                  formatter={(v) => money(Number(v))}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Claimed" stackId="a" fill={C.claimed} stroke={surface} strokeWidth={1} />
                <Bar dataKey="Review" stackId="a" fill={C.review} stroke={surface} strokeWidth={1} />
                <Bar dataKey="Excluded" stackId="a" fill={C.excluded} stroke={surface} strokeWidth={1} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <HabitsCard habits={habits} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <SectionTitle>Spend by toll road</SectionTitle>
          <div style={{ height: Math.max(140, roadData.length * 44 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roadData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} stroke={grid} />
                <XAxis type="number" tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="road" width={170} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: theme === 'dark' ? 'rgba(148,163,184,.08)' : 'rgba(15,23,42,.04)' }}
                  contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}
                  formatter={(v) => money(Number(v))}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Claimed" stackId="r" fill={C.claimed} stroke={surface} strokeWidth={1} />
                <Bar dataKey="Other" name="Not claimed" stackId="r" fill={C.other} stroke={surface} strokeWidth={1} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <SectionTitle>Statements</SectionTitle>
          <ul className="space-y-3">
            {statements.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="truncate font-medium">{s.fileName}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.invoiceRef && <Badge tone="blue">Inv {s.invoiceRef}</Badge>}
                  {s.accountNumber && <Badge>Acct {s.accountNumber}</Badge>}
                  <Badge>{s.transactionCount} tolls</Badge>
                </div>
              </li>
            ))}
          </ul>
          <button className="btn-secondary mt-3 w-full" onClick={() => openModal('upload')}>
            <FileUp className="h-4 w-4" /> Add statements
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  onClick,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  hint: string;
  tone?: 'blue' | 'amber' | 'emerald';
  onClick?: () => void;
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cx('card p-4 text-left', onClick && 'lift')}>
      <div className="flex items-center gap-2">
        <span className={cx('rounded-md p-1.5', tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div>
    </Comp>
  );
}

function HabitsCard({ habits }: { habits: ReturnType<typeof useAnalysis>['habits'] }) {
  const maxDay = Math.max(1, ...habits.commonWorkDays.map((d) => d.count));
  const byWeekday = new Map(habits.commonWorkDays.map((d) => [d.weekday, d.count]));
  return (
    <div className="card p-5">
      <SectionTitle right={<Badge tone="sky"><Brain className="h-3 w-3" /> Learned</Badge>}>AI learned commute habits</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Habit icon={Clock} label="Avg morning departure" value={habits.avgMorningDeparture ? to12h(habits.avgMorningDeparture) : '—'} />
        <Habit icon={Clock} label="Avg evening return" value={habits.avgEveningReturn ? to12h(habits.avgEveningReturn) : '—'} />
        <Habit icon={CalendarCheck} label="Trip pairing rate" value={`${Math.round(habits.pairingRate * 100)}%`} sub={`${habits.pairedDays}/${habits.tripDays} days return trip`} />
        <Habit icon={Route} label="Top road" value={habits.topRoads[0]?.road.replace(' Motorway', ' Mwy') ?? '—'} sub={habits.topRoads[0] ? money(habits.topRoads[0].spend) : undefined} />
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-slate-500">Travel days by weekday</div>
        <div className="flex items-end gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
            const c = byWeekday.get(wd) ?? 0;
            return (
              <div key={wd} className="flex flex-1 flex-col items-center gap-1" title={`${c} travel day(s)`}>
                <div className="flex h-16 w-full items-end rounded bg-slate-100 dark:bg-slate-800">
                  <div className="w-full rounded bg-blue-500/80" style={{ height: `${(c / maxDay) * 100}%` }} />
                </div>
                <span className="text-[10px] text-slate-500">{WEEKDAYS_SHORT[wd]}</span>
                <span className="num text-[10px] font-medium">{c}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium text-slate-500">Most used toll points</div>
        <ul className="space-y-1 text-xs">
          {habits.topTollPoints.slice(0, 4).map((p) => (
            <li key={p.tollPoint} className="flex justify-between gap-2">
              <span className="truncate">{p.tollPoint}</span>
              <span className="num text-slate-500">{p.count}×</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Habit({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="num mt-1 truncate text-sm font-semibold">{value}</div>
      {sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
