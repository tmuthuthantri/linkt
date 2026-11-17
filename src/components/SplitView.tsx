import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileUp, Search } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { useAnalysis } from '../hooks/useAnalysis';
import type { ClaimStatus } from '../types';
import { fmtDate, money } from '../utils/format';
import PdfViewer from './PdfViewer';
import { ConfidenceBadge, EmptyState, STATUS_META, cx } from './ui';

export default function SplitView() {
  const statements = useTollStore((s) => s.statements);
  const activeId = useTollStore((s) => s.activeStatementId);
  const setActive = useTollStore((s) => s.setActiveStatement);
  const selectedId = useTollStore((s) => s.selectedTxnId);
  const selectTxn = useTollStore((s) => s.selectTxn);
  const setIncluded = useTollStore((s) => s.setIncluded);
  const openModal = useTollStore((s) => s.openModal);
  const { transactions } = useAnalysis();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | ClaimStatus>('');
  const listRef = useRef<HTMLDivElement>(null);

  const statementId = statements.some((s) => s.id === activeId) ? activeId! : statements[0]?.id;
  const stmtTxns = useMemo(() => transactions.filter((t) => t.statementId === statementId), [transactions, statementId]);
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return stmtTxns.filter(
      (t) => (!status || t.status === status) && (!qq || `${t.tollPoint} ${t.date} ${fmtDate(t.date)} ${t.time} ${t.amount.toFixed(2)}`.toLowerCase().includes(qq)),
    );
  }, [stmtTxns, q, status]);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  if (!statements.length || !statementId) {
    return (
      <div className="mx-auto max-w-3xl pt-8">
        <EmptyState
          icon={<FileUp className="h-8 w-8" />}
          title="No statement to review"
          body="Upload a Linkt PDF to inspect every claimed toll highlighted directly on the original document."
          actions={<button className="btn-primary" onClick={() => openModal('upload')}><FileUp className="h-4 w-4" /> Upload statements</button>}
        />
      </div>
    );
  }

  const claimed = stmtTxns.filter((t) => t.status === 'included');

  return (
    <div className="flex h-[calc(100vh-88px)] min-h-[560px] flex-col gap-3 lg:h-[calc(100vh-76px)]">
      {statements.length > 1 && (
        <div className="scroll-thin flex gap-1 overflow-x-auto">
          {statements.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cx(
                'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium',
                s.id === statementId ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
              )}
            >
              {s.fileName}
            </button>
          ))}
        </div>
      )}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Transaction list */}
        <div className="card flex min-h-0 flex-col overflow-hidden max-lg:h-[45vh]">
          <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Statement tolls</h2>
              <span className="text-xs text-slate-500">
                <span className="num font-medium text-emerald-700 dark:text-emerald-400">{money(claimed.reduce((s, t) => s + t.amount, 0))}</span> · {claimed.length}/{stmtTxns.length} claimed
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input className="input py-1.5! pl-8! text-xs!" placeholder="Filter tolls…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {(['', 'included', 'review', 'excluded'] as const).map((s) => (
                <button
                  key={s || 'all'}
                  onClick={() => setStatus(s)}
                  className={cx('rounded-md px-2 py-1 text-[11px] font-medium', status === s ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}
                >
                  {s ? STATUS_META[s].label : 'All'} <span className="num opacity-70">{s ? stmtTxns.filter((t) => t.status === s).length : stmtTxns.length}</span>
                </button>
              ))}
            </div>
          </div>
          <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {visible.map((t, i) => {
              const newDay = i === 0 || visible[i - 1].date !== t.date;
              const sel = t.id === selectedId;
              return (
                <div key={t.id}>
                  {newDay && (
                    <div className="sticky top-0 z-[1] border-y border-slate-200 bg-slate-50/95 px-3 py-1 text-[11px] font-semibold text-slate-600 backdrop-blur dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-300">
                      {fmtDate(t.date)} <span className="font-normal text-slate-500">· {t.dayLabel.split(' (')[0]}</span>
                    </div>
                  )}
                  <div
                    data-id={t.id}
                    onClick={() => selectTxn(t.id)}
                    className={cx(
                      'flex cursor-pointer items-center gap-2 border-l-[3px] px-3 py-2 transition-colors',
                      sel ? 'border-l-blue-600 bg-blue-50 dark:bg-blue-500/10' : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                      checked={t.status === 'included'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => setIncluded([t.id], t.status !== 'included')}
                      aria-label="Include in claim"
                    />
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_META[t.status].dot)} title={STATUS_META[t.status].label} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{t.tollPoint}</div>
                      <div className="num text-[11px] text-slate-500">{t.time} · p.{t.pdfCoords?.page}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="num text-xs font-semibold">{money(t.amount)}</span>
                      <ConfidenceBadge value={t.confidence} manual={t.manual} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!visible.length && <div className="p-6 text-center text-xs text-slate-500">No tolls match.</div>}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-2 dark:border-slate-800">
            <button
              className="btn-secondary btn-sm flex-1"
              onClick={() => setIncluded(visible.filter((t) => t.status === 'review' && t.confidence >= 80).map((t) => t.id), true, 'Claim high-confidence review items (PDF review)')}
            >
              <Check className="h-3.5 w-3.5" /> Claim ≥80% review items
            </button>
          </div>
        </div>

        {/* PDF */}
        <div className="card flex min-h-[480px] flex-col overflow-hidden">
          <PdfViewer statementId={statementId} transactions={stmtTxns} selectedId={selectedId} onSelect={selectTxn} />
        </div>
      </div>
    </div>
  );
}
