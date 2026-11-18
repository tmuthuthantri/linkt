import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarOff, CheckCircle2, ClipboardPaste, ImageUp, Loader2, Plus, RefreshCw, ScanText, ShieldCheck, Trash2 } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useTollStore } from '../store/useTollStore';
import { getAnalysisSnapshot } from '../hooks/useAnalysis';
import { expandRange, parseLeaveText, type LeaveCandidate } from '../utils/leaveScreenshotParser';
import type { LeaveDate, LeaveType } from '../types';
import { fmtDate, money, uid } from '../utils/format';
import { Badge, Modal, Toggle, cx } from './ui';

const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'RDO', 'Personal', 'Long Service', 'Training', 'Other'];

interface Shot {
  key: string;
  name: string;
  url: string;
  state: 'ocr' | 'done' | 'error';
  progress: number;
  status: string;
  text: string;
  confidence: number;
  error?: string;
  found: number;
}

export default function LeaveImportModal() {
  const open = useTollStore((s) => s.leaveImportOpen);
  const setOpen = useTollStore((s) => s.setLeaveImportOpen);
  const applyLeaveImport = useTollStore((s) => s.applyLeaveImport);
  const transactions = useTollStore((s) => s.transactions);
  const existingLeave = useTollStore((s) => s.settings.leaveDates);

  const [shots, setShots] = useState<Shot[]>([]);
  const [rows, setRows] = useState<LeaveCandidate[]>([]);
  const [clearOverrides, setClearOverrides] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showText, setShowText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const contextYears = useMemo(() => [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))], [transactions]);

  const close = () => {
    setOpen(false);
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setRows([]);
    setResult(null);
    setShowText(null);
  };

  const mergeRows = (incoming: LeaveCandidate[]) =>
    setRows((prev) => {
      const keys = new Set(prev.map((r) => `${r.from}|${r.to}|${r.type}`));
      const fresh = incoming.filter((r) => !keys.has(`${r.from}|${r.to}|${r.type}`)).map((r) => ({ ...r, id: uid('lc') }));
      return [...prev, ...fresh].sort((a, b) => a.from.localeCompare(b.from));
    });

  const processImages = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (!imgs.length) return;
      setResult(null);
      const { ocrImage } = await import('../utils/ocr');
      for (const file of imgs) {
        const key = uid('shot');
        setShots((s) => [...s, { key, name: file.name || 'Pasted screenshot', url: URL.createObjectURL(file), state: 'ocr', progress: 0, status: 'Starting…', text: '', confidence: 0, found: 0 }]);
        const patch = (p: Partial<Shot>) => setShots((s) => s.map((x) => (x.key === key ? { ...x, ...p } : x)));
        try {
          const { text, confidence } = await ocrImage(file, (progress, status) => patch({ progress, status }));
          const found = parseLeaveText(text, { contextYears });
          patch({ state: 'done', text, confidence, found: found.length });
          mergeRows(found);
        } catch (e) {
          console.error(e);
          patch({ state: 'error', error: e instanceof Error ? e.message : 'Could not read this image' });
        }
      }
    },
    [contextYears],
  );

  // Paste screenshots straight from the clipboard (Win+Shift+S / Cmd+Shift+4 → Ctrl/Cmd+V)
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void processImages(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, processImages]);

  const reparse = (shot: Shot, text: string) => {
    setShots((s) => s.map((x) => (x.key === shot.key ? { ...x, text, found: parseLeaveText(text, { contextYears }).length } : x)));
    mergeRows(parseLeaveText(text, { contextYears }));
  };

  const update = (id: string, p: Partial<LeaveCandidate>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // Impact on the uploaded statements
  const impact = useMemo(() => {
    const analysis = getAnalysisSnapshot();
    const byDate = new Map<string, typeof analysis.transactions>();
    for (const t of analysis.transactions) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
    const existing = new Set(existingLeave.map((l) => l.date));
    const perRow = new Map<string, { days: number; tolls: number; claimed: number; manual: number }>();
    const allDays = new Set<string>();
    let tolls = 0;
    let claimed = 0;
    let manual = 0;
    for (const r of rows) {
      const days = r.to >= r.from ? expandRange(r.from, r.to) : [];
      const stat = { days: days.length, tolls: 0, claimed: 0, manual: 0 };
      for (const d of days) {
        for (const t of byDate.get(d) ?? []) {
          stat.tolls++;
          if (t.status === 'included') stat.claimed += t.amount;
          if (t.manual && t.status === 'included') stat.manual++;
        }
      }
      perRow.set(r.id, stat);
      if (!r.include) continue;
      for (const d of days) {
        if (allDays.has(d)) continue;
        allDays.add(d);
        for (const t of byDate.get(d) ?? []) {
          tolls++;
          // Full leave excludes the toll; half-day leave moves it to review (also out of the claim until confirmed).
          if (t.status === 'included' && (!t.manual || (clearOverrides && !r.partial))) claimed += t.amount;
          if (t.manual && t.status === 'included') manual++;
        }
      }
    }
    const already = [...allDays].filter((d) => existing.has(d)).length;
    return { perRow, days: allDays.size, tolls, claimed, manual, already };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, clearOverrides, existingLeave, transactions]);

  const apply = () => {
    const entries: LeaveDate[] = [];
    const seen = new Set<string>();
    for (const r of rows.filter((x) => x.include && x.to >= x.from)) {
      for (const d of expandRange(r.from, r.to)) {
        if (seen.has(d)) continue;
        seen.add(d);
        entries.push({ id: uid('leave'), date: d, type: r.type, partial: r.partial || undefined, note: r.status === 'pending' ? 'Pending approval' : undefined, source: 'screenshot' });
      }
    }
    const summary = rows
      .filter((r) => r.include)
      .map((r) => `${r.type}${r.partial ? ' (part day)' : ''} ${r.from === r.to ? r.from : `${r.from}→${r.to}`}`)
      .join('; ');
    const res = applyLeaveImport(entries, { clearOverrides, summary });
    setResult(
      `Added ${res.added} leave day(s)${res.replaced ? `, updated ${res.replaced}` : ''}. Tolls on these days have been re-scored${res.overridesCleared ? ` and ${res.overridesCleared} manual decision(s) reset` : ''}.`,
    );
    setRows([]);
  };

  const busy = shots.some((s) => s.state === 'ocr');
  const included = rows.filter((r) => r.include);

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Import leave from screenshots"
      subtitle="Upload or paste screenshots of your leave (HR portal, payroll, calendar). Text is read on this device — images are never uploaded."
      icon={<CalendarOff className="h-5 w-5" />}
      footer={
        <>
          {result ? (
            <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {result}
            </span>
          ) : (
            included.length > 0 && (
              <span className="mr-auto text-xs text-slate-600 dark:text-slate-400">
                <span className="num font-semibold">{impact.days}</span> leave day(s) · <span className="num font-semibold">{impact.tolls}</span> statement tolls on those days
                {impact.claimed > 0 && (
                  <>
                    {' '}· <span className="num font-semibold text-rose-600">−{money(impact.claimed)}</span> removed from claim
                  </>
                )}
              </span>
            )
          )}
          <button className="btn-secondary" onClick={close}>{result ? 'Done' : 'Cancel'}</button>
          {!result && (
            <button className="btn-primary" disabled={!included.length || busy} onClick={apply}>
              <CheckCircle2 className="h-4 w-4" /> Apply {included.length ? `${impact.days} day(s)` : ''}
            </button>
          )}
        </>
      }
    >
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void processImages([...e.dataTransfer.files]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors',
          dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
        )}
      >
        <ImageUp className={cx('mb-2 h-9 w-9', dragging ? 'text-blue-600' : 'text-slate-400')} />
        <p className="text-sm font-medium">Drop leave screenshots here, or click to browse</p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <ClipboardPaste className="h-3.5 w-3.5" /> Or paste a screenshot with Ctrl+V / ⌘V · PNG, JPG, WebP · multiple allowed
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void processImages([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Works best with a clear, uncropped list or table of your leave requests showing type, dates and status.
      </p>

      {/* Screenshots */}
      {shots.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shots.map((s) => (
            <div key={s.key} className="flex gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
              <img src={s.url} alt={s.name} className="h-16 w-24 shrink-0 rounded border border-slate-200 object-cover object-top dark:border-slate-700" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="truncate font-medium">{s.name}</div>
                {s.state === 'ocr' && (
                  <>
                    <div className="mt-1 flex items-center gap-1 text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> {s.status === 'recognizing text' ? 'Reading text…' : 'Loading OCR engine…'}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((s.status === 'recognizing text' ? s.progress : s.progress * 0.2) * 100)}%` }} />
                    </div>
                  </>
                )}
                {s.state === 'done' && (
                  <>
                    <div className={cx('mt-1', s.found ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600')}>
                      {s.found ? `${s.found} leave entr${s.found === 1 ? 'y' : 'ies'} found` : 'No leave dates recognised'}
                    </div>
                    <div className="text-slate-500">OCR confidence {Math.round(s.confidence)}%</div>
                    <button className="mt-0.5 font-medium text-blue-600 hover:underline" onClick={() => setShowText(showText === s.key ? null : s.key)}>
                      {showText === s.key ? 'Hide text' : 'View / fix text'}
                    </button>
                  </>
                )}
                {s.state === 'error' && <div className="mt-1 text-rose-600">{s.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showText && (() => {
        const s = shots.find((x) => x.key === showText);
        if (!s) return null;
        return <OcrTextEditor key={s.key} initial={s.text} onReparse={(t) => reparse(s, t)} />;
      })()}

      {/* Review table */}
      {(rows.length > 0 || shots.some((s) => s.state === 'done')) && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Review detected leave</h4>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  { id: uid('lc'), from: '', to: '', type: 'Annual', typeGuessed: false, status: 'approved', partial: false, include: true, source: 'Added manually', warnings: [] },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              No dates were recognised. Try a sharper or less cropped screenshot, fix the text via “View / fix text”, or add rows manually.
            </div>
          ) : (
            <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:bg-slate-800/60">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-2 py-2">From</th>
                    <th className="px-2 py-2">To</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Part day</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Effect on statements</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r) => {
                    const st = impact.perRow.get(r.id);
                    const bad = !r.from || !r.to || r.to < r.from;
                    const span = !bad ? differenceInCalendarDays(parseISO(r.to), parseISO(r.from)) + 1 : 0;
                    return (
                      <tr key={r.id} className={cx(!r.include && 'opacity-55')}>
                        <td className="px-3 py-2 align-top">
                          <input type="checkbox" className="mt-1.5 h-4 w-4 accent-blue-600" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} aria-label="Include this leave" />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input type="date" className="input py-1! text-xs!" value={r.from} onChange={(e) => update(r.id, { from: e.target.value, to: r.to && r.to >= e.target.value ? r.to : e.target.value, warnings: [] })} />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input type="date" className="input py-1! text-xs!" value={r.to} min={r.from} onChange={(e) => update(r.id, { to: e.target.value, warnings: [] })} />
                          {!bad && <div className="mt-0.5 text-[11px] text-slate-500">{span} day{span === 1 ? '' : 's'}</div>}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select className={cx('input py-1! text-xs!', r.typeGuessed && 'border-amber-400!')} value={r.type} onChange={(e) => update(r.id, { type: e.target.value as LeaveType, typeGuessed: false })}>
                            {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center align-top">
                          <input type="checkbox" className="mt-1.5 h-4 w-4 accent-blue-600" checked={r.partial} onChange={(e) => update(r.id, { partial: e.target.checked })} aria-label="Partial day" />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Badge tone={r.status === 'approved' ? 'emerald' : r.status === 'pending' ? 'amber' : r.status === 'declined' ? 'rose' : 'slate'}>
                            {r.status === 'unknown' ? 'Not shown' : r.status[0].toUpperCase() + r.status.slice(1)}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 align-top text-xs">
                          {bad ? (
                            <span className="text-rose-600">Check the dates</span>
                          ) : st && st.tolls ? (
                            <>
                              <div>
                                <span className="num font-medium">{st.tolls}</span> toll{st.tolls === 1 ? '' : 's'} on these days
                              </div>
                              {st.claimed > 0 && !r.partial && <div className="num text-rose-600">−{money(st.claimed)} from claim</div>}
                              {r.partial && (
                                <div className="text-amber-600">
                                  Moved to review{st.claimed > 0 && <span className="num"> (−{money(st.claimed)} until confirmed)</span>}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400">No tolls on these days</span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <button className="btn-ghost p-1!" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="space-y-1 border-t border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/30">
                {rows.map((r) =>
                  r.warnings.length || r.source ? (
                    <div key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                      <span className="num font-medium text-slate-600 dark:text-slate-300">{r.from ? fmtDate(r.from, 'd MMM yy') : '—'}</span>
                      <span className="num truncate text-slate-400" title={r.source}>“{r.source}”</span>
                      {r.warnings.map((w) => (
                        <span key={w} className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> {w}
                        </span>
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-4 space-y-2">
              <Toggle
                checked={clearOverrides}
                onChange={setClearOverrides}
                label="Reset my manual claim decisions on these leave days"
                description={
                  impact.manual
                    ? `${impact.manual} toll(s) on these days were manually claimed — resetting lets the leave exclude them.`
                    : 'Manual decisions always win over AI scoring, so they are reset by default.'
                }
              />
              {impact.already > 0 && <p className="text-xs text-slate-500">{impact.already} of these days are already recorded as leave and will be updated.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function OcrTextEditor({ initial, onReparse }: { initial: string; onReparse: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs font-medium"><ScanText className="h-3.5 w-3.5" /> Recognised text — correct any misread dates, then re-scan</span>
        <button className="btn-secondary btn-sm" onClick={() => onReparse(text)}>
          <RefreshCw className="h-3.5 w-3.5" /> Re-scan text
        </button>
      </div>
      <textarea className="input num min-h-[140px] text-xs!" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
    </div>
  );
}
