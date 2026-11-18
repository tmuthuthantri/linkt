import { Fragment, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileSearch,
  FileUp,
  Filter,
  Layers,
  ListX,
  MessageSquareText,
  RotateCcw,
  Search,
  SquareCheck,
  Undo2,
  X,
} from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { useAnalysis } from '../hooks/useAnalysis';
import type { AnalysedTransaction, ClaimStatus } from '../types';
import { fmtDate, money } from '../utils/format';
import { Badge, ConfidenceBadge, EmptyState, StatusPill, cx } from './ui';

interface Filters {
  q: string;
  from: string;
  to: string;
  road: string;
  vehicle: string;
  status: '' | ClaimStatus;
  day: '' | 'work' | 'non-work';
  minConf: number;
}
const EMPTY: Filters = { q: '', from: '', to: '', road: '', vehicle: '', status: '', day: '', minConf: 0 };

export const vehicleKey = (t: AnalysedTransaction) => t.tagNumber ?? t.vehicleRego ?? 'Unknown';

export function applyFilters(list: AnalysedTransaction[], f: Filters) {
  const q = f.q.trim().toLowerCase();
  return list.filter((t) => {
    if (q && ![t.tollPoint, t.road, t.date, fmtDate(t.date), t.time, t.tagNumber ?? '', t.vehicleRego ?? '', t.notes, t.invoiceRef, t.amount.toFixed(2)].some((s) => s.toLowerCase().includes(q))) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.road && t.road !== f.road) return false;
    if (f.vehicle && vehicleKey(t) !== f.vehicle) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.day === 'work' && !t.isWorkDay) return false;
    if (f.day === 'non-work' && t.isWorkDay) return false;
    if (t.confidence < f.minConf) return false;
    return true;
  });
}

export default function TransactionsView() {
  const { transactions, days } = useAnalysis();
  const setIncluded = useTollStore((s) => s.setIncluded);
  const resetOverrides = useTollStore((s) => s.resetOverrides);
  const openModal = useTollStore((s) => s.openModal);
  const [f, setF] = useState<Filters>(EMPTY);
  const [grouped, setGrouped] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const roads = useMemo(() => [...new Set(transactions.map((t) => t.road))].sort(), [transactions]);
  const vehicles = useMemo(() => [...new Set(transactions.map(vehicleKey))].sort(), [transactions]);
  const filtered = useMemo(() => applyFilters(transactions, f), [transactions, f]);
  const filteredIds = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const dayMap = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const groupedDays = useMemo(() => {
    const m = new Map<string, AnalysedTransaction[]>();
    for (const t of filtered) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [filtered]);

  if (!transactions.length) {
    return (
      <EmptyState
        icon={<FileUp className="h-8 w-8" />}
        title="No transactions yet"
        body="Upload a Linkt statement to see every toll, its AI confidence score and your claim decisions."
        actions={<button className="btn-primary" onClick={() => openModal('upload')}><FileUp className="h-4 w-4" /> Upload statements</button>}
      />
    );
  }

  const ids = (pred: (t: AnalysedTransaction) => boolean) => filtered.filter(pred).map((t) => t.id);
  const activeFilterCount = Object.entries(f).filter(([k, v]) => k !== 'q' && v !== EMPTY[k as keyof Filters]).length;
  const filteredClaim = filtered.filter((t) => t.status === 'included').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing <span className="num">{filtered.length}</span> of <span className="num">{transactions.length}</span> tolls · selected in view{' '}
            <span className="num font-medium text-emerald-700 dark:text-emerald-400">{money(filteredClaim, true)}</span>
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          <Layers className="h-4 w-4 text-slate-500" /> Daily trip grouping
        </label>
      </div>

      {/* Search + filters */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9!" placeholder="Search toll point, date, tag, amount, notes…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </div>
          <button className={cx('btn-secondary', showFilters && 'ring-2 ring-blue-500/30')} onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-4 w-4" /> Filters {activeFilterCount > 0 && <Badge tone="blue">{activeFilterCount}</Badge>}
          </button>
          {(activeFilterCount > 0 || f.q) && (
            <button className="btn-ghost" onClick={() => setF(EMPTY)}>
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 dark:border-slate-800">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div>
            <div>
              <label className="label">Road</label>
              <select className="input" value={f.road} onChange={(e) => setF({ ...f, road: e.target.value })}>
                <option value="">All roads</option>
                {roads.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vehicle / tag</label>
              <select className="input" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}>
                <option value="">All</option>
                {vehicles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Filters['status'] })}>
                <option value="">Any</option>
                <option value="included">Included</option>
                <option value="review">Requires review</option>
                <option value="excluded">Excluded</option>
              </select>
            </div>
            <div>
              <label className="label">Day type</label>
              <select className="input" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value as Filters['day'] })}>
                <option value="">All days</option>
                <option value="work">Work days</option>
                <option value="non-work">Non-work days</option>
              </select>
            </div>
            <div>
              <label className="label">Min confidence: <span className="num">{f.minConf}%</span></label>
              <input type="range" min={0} max={100} step={5} className="mt-2 w-full accent-blue-600" value={f.minConf} onChange={(e) => setF({ ...f, minConf: Number(e.target.value) })} />
            </div>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setIncluded(ids(() => true), true, 'Select all (filtered)')}>
          <SquareCheck className="h-3.5 w-3.5" /> Select all
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setIncluded(ids(() => true), false, 'Deselect all (filtered)')}>
          <ListX className="h-3.5 w-3.5" /> Deselect all
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setIncluded(ids((t) => t.isWorkDay), true, 'Select work days only')}>
          <Check className="h-3.5 w-3.5" /> Select work days only
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setIncluded(ids((t) => !t.manual && t.confidence >= 80), true, 'Select high confidence (≥80%)')}>
          <Check className="h-3.5 w-3.5" /> Select high confidence
        </button>
        <button
          className="btn-secondary btn-sm"
          onClick={() => setIncluded(ids((t) => !!dayMap.get(t.date)?.likelyOfficeAttendance), true, 'Apply auto office attendance')}
        >
          <Building2 className="h-3.5 w-3.5" /> Apply auto office attendance
        </button>
        <button className="btn-ghost btn-sm" onClick={() => confirm('Discard all manual include/exclude decisions and return to the AI recommendations?') && resetOverrides()}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to AI decisions
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5">Date / time</th>
                <th className="px-3 py-2.5">Toll point</th>
                <th className="px-3 py-2.5">Vehicle / tag</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5 text-right">GST</th>
                <th className="px-3 py-2.5">Confidence</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-24 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grouped
                ? groupedDays.map(([date, list]) => {
                    const d = dayMap.get(date)!;
                    const dayIds = list.map((t) => t.id);
                    const allIn = list.every((t) => t.status === 'included');
                    const visibleTotal = list.reduce((s, t) => s + t.amount, 0);
                    const visibleClaim = list.filter((t) => t.status === 'included').reduce((s, t) => s + t.amount, 0);
                    return (
                      <Fragment key={date}>
                        <tr className="bg-slate-50/80 dark:bg-slate-800/30">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Claim all tolls on ${date}`}
                              className="h-4 w-4 accent-emerald-600"
                              checked={allIn}
                              onChange={() => setIncluded(dayIds, !allIn, `Day ${fmtDate(date, 'd MMM')}`)}
                            />
                          </td>
                          <td colSpan={3} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{fmtDate(date)}</span>
                              <DayBadge dayType={d.dayType} label={d.dayLabel} />
                              {d.likelyOfficeAttendance && (
                                <Badge tone="emerald">
                                  <Building2 className="h-3 w-3" /> Likely Office Attendance
                                </Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                {d.trips.length} trip{d.trips.length === 1 ? '' : 's'} · {list.length} toll{list.length === 1 ? '' : 's'}
                              </span>
                            </div>
                          </td>
                          <td className="num px-3 py-2 text-right font-semibold">{money(visibleTotal)}</td>
                          <td className="num px-3 py-2 text-right text-xs text-slate-500">{money(visibleTotal / 11)}</td>
                          <td colSpan={3} className="px-3 py-2 text-xs text-slate-500">
                            Claiming <span className="num font-medium text-emerald-700 dark:text-emerald-400">{money(visibleClaim)}</span>
                          </td>
                        </tr>
                        {list.map((t) => (
                          <TxnRow key={t.id} t={t} expanded={expanded.has(t.id)} onToggleExpand={() => toggleSet(setExpanded, t.id)} indent />
                        ))}
                      </Fragment>
                    );
                  })
                : filtered.map((t) => <TxnRow key={t.id} t={t} expanded={expanded.has(t.id)} onToggleExpand={() => toggleSet(setExpanded, t.id)} />)}
              {!filteredIds.size && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-sm text-slate-500">
                    No tolls match these filters.{' '}
                    <button className="font-medium text-blue-600 hover:underline" onClick={() => setF(EMPTY)}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function toggleSet(set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
  set((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
}

export function DayBadge({ dayType, label }: { dayType: AnalysedTransaction['dayType']; label: string }) {
  const map: Record<AnalysedTransaction['dayType'], { tone: 'blue' | 'sky' | 'slate' | 'rose' | 'amber' | 'emerald'; text: string }> = {
    rostered: { tone: 'blue', text: 'Rostered' },
    'saturday-roster': { tone: 'sky', text: 'Saturday shift' },
    'one-off-work': { tone: 'sky', text: 'One-off work day' },
    weekend: { tone: 'slate', text: 'Weekend' },
    'non-rostered': { tone: 'slate', text: 'Not rostered' },
    leave: { tone: 'amber', text: 'Leave' },
    'public-holiday': { tone: 'rose', text: 'Public holiday' },
  };
  const m = map[dayType];
  return (
    <span title={label}>
      <Badge tone={m.tone}>{dayType === 'public-holiday' || dayType === 'leave' ? label.replace('Public holiday — ', '') : m.text}</Badge>
    </span>
  );
}

function TxnRow({ t, expanded, onToggleExpand, indent }: { t: AnalysedTransaction; expanded: boolean; onToggleExpand: () => void; indent?: boolean }) {
  const setIncluded = useTollStore((s) => s.setIncluded);
  const setNote = useTollStore((s) => s.setNote);
  const selectTxn = useTollStore((s) => s.selectTxn);
  const setView = useTollStore((s) => s.setView);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.notes);
  const included = t.status === 'included';

  return (
    <>
      <tr className={cx('group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40', included && 'bg-emerald-50/40 dark:bg-emerald-500/[0.04]')}>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            aria-label="Include in claim"
            className="h-4 w-4 accent-emerald-600"
            checked={included}
            onChange={() => setIncluded([t.id], !included)}
          />
        </td>
        <td className={cx('px-3 py-2 whitespace-nowrap', indent && 'pl-6')}>
          <div className="num text-sm">{indent ? t.time : `${fmtDate(t.date, 'dd MMM yyyy')} ${t.time}`}</div>
          <div className="text-[11px] text-slate-500 capitalize">{t.tripRole === 'other' ? 'Other trip' : `${t.tripRole} commute`}</div>
        </td>
        <td className="max-w-[300px] px-3 py-2">
          <div className="truncate font-medium" title={t.tollPoint}>{t.tollPoint}</div>
          <div className="truncate text-[11px] text-slate-500">{t.road}{t.direction !== '—' ? ` · ${t.direction}` : ''}</div>
          {t.notes && !editing && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-blue-700 dark:text-blue-300">
              <MessageSquareText className="h-3 w-3 shrink-0" /> {t.notes}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          <div className="num">{t.tagNumber ?? '—'}</div>
          {t.vehicleRego && <div className="text-slate-500">{t.vehicleRego}</div>}
          {t.vehicleRegistered === false && <Badge tone="rose">Unregistered</Badge>}
        </td>
        <td className="num px-3 py-2 text-right font-medium">{money(t.amount)}</td>
        <td className="num px-3 py-2 text-right text-xs text-slate-500">{money(t.gst)}</td>
        <td className="px-3 py-2">
          <button onClick={onToggleExpand} className="flex items-center gap-1 text-left" aria-expanded={expanded} title="Show AI reasoning">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
            <ConfidenceBadge value={t.confidence} manual={t.manual} />
          </button>
          <div className="mt-0.5 max-w-[180px] truncate pl-4.5 text-[11px] text-slate-500">{t.summary}</div>
        </td>
        <td className="px-3 py-2">
          <StatusPill status={t.status} manual={t.manual} />
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-0.5 opacity-70 group-hover:opacity-100">
            <button className="btn-ghost p-1.5!" title="Add / edit note" aria-label="Edit note" onClick={() => { setDraft(t.notes); setEditing((v) => !v); }}>
              <MessageSquareText className="h-4 w-4" />
            </button>
            <button
              className="btn-ghost p-1.5!"
              title="Show on original PDF"
              aria-label="Show on PDF"
              onClick={() => {
                selectTxn(t.id);
                setView('split');
              }}
            >
              <FileSearch className="h-4 w-4" />
            </button>
            {t.manual && (
              <button className="btn-ghost p-1.5!" title="Revert to AI decision" aria-label="Revert to AI decision" onClick={() => setIncluded([t.id], undefined)}>
                <Undo2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="bg-blue-50/40 dark:bg-blue-500/5">
          <td />
          <td colSpan={8} className="px-3 py-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setNote(t.id, draft.trim());
                setEditing(false);
              }}
            >
              <input autoFocus className="input" placeholder="e.g. Client site visit — Acme Corp, Eagle Farm" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={240} />
              <button className="btn-primary" type="submit">Save</button>
              <button className="btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          </td>
        </tr>
      )}
      {expanded && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/20">
          <td />
          <td colSpan={8} className="px-3 py-3">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Why the AI scored this {t.confidence}%</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-400">
              {t.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className="num mt-2 text-[11px] text-slate-400">
              Source: {t.invoiceRef ? `Invoice ${t.invoiceRef} · ` : ''}page {t.pdfCoords?.page ?? '?'} · “{t.rawText}”
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
