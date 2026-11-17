import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Maximize2, Search, X, ZoomIn, ZoomOut, Ban, Undo2 } from 'lucide-react';
import { loadPdfBytes, useTollStore } from '../store/useTollStore';
import { openPdf } from '../utils/pdfSetup';
import { readPdfText, type PageText } from '../utils/pdfExtractor';
import type { AnalysedTransaction } from '../types';
import { fmtDate, money } from '../utils/format';
import { ConfidenceBadge, StatusPill, Toggle, cx } from './ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

interface Props {
  statementId: string;
  transactions: AnalysedTransaction[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const HL_STYLE = {
  included: 'bg-emerald-400/25 border-emerald-600/70 dark:bg-emerald-400/30',
  review: 'bg-amber-300/35 border-amber-500/80',
  excluded: 'bg-slate-400/25 border-slate-500/60',
};

export default function PdfViewer({ statementId, transactions, selectedId, onSelect }: Props) {
  const onlyClaimed = useTollStore((s) => s.settings.onlyHighlightClaimed);
  const updateSettings = useTollStore((s) => s.updateSettings);
  const setIncluded = useTollStore((s) => s.setIncluded);

  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [scale, setScale] = useState(1.2);
  const [fitWidth, setFitWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [textPages, setTextPages] = useState<PageText[]>([]);
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [popoverId, setPopoverId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Load the original PDF
  useEffect(() => {
    let cancelled = false;
    let doc: PdfDoc | null = null;
    setPdf(null);
    setError(null);
    setPageSizes([]);
    setTextPages([]);
    (async () => {
      try {
        const bytes = await loadPdfBytes(statementId);
        if (!bytes) throw new Error('The original PDF for this statement is no longer stored. Re-upload it to view highlights.');
        doc = await openPdf(bytes);
        if (cancelled) return doc.destroy();
        const sizes: { w: number; h: number }[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const vp = (await doc.getPage(p)).getViewport({ scale: 1 });
          sizes.push({ w: vp.width, h: vp.height });
        }
        if (cancelled) return;
        setPageSizes(sizes);
        setPdf(doc);
        readPdfText(doc).then((t) => !cancelled && setTextPages(t)).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open PDF');
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy?.();
    };
  }, [statementId]);

  // Fit-to-width scale
  useLayoutEffect(() => {
    if (!fitWidth || !pageSizes.length || !scrollRef.current) return;
    const el = scrollRef.current;
    const compute = () => {
      const avail = el.clientWidth - 32;
      const s = Math.max(0.5, Math.min(2.5, avail / pageSizes[0].w));
      setScale(Math.round(s * 100) / 100);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitWidth, pageSizes]);

  // Render pages at the current scale (high-DPI)
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    (async () => {
      for (let p = 1; p <= pdf.numPages; p++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[p - 1];
        if (!canvas) continue;
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: scale * dpr });
        const off = document.createElement('canvas');
        off.width = Math.floor(vp.width);
        off.height = Math.floor(vp.height);
        const ctx = off.getContext('2d')!;
        const task = page.render({ canvas: off, canvasContext: ctx, viewport: vp });
        tasks.push(task);
        try {
          await task.promise;
        } catch {
          return;
        }
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext('2d')!.drawImage(off, 0, 0);
      }
    })();
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [pdf, scale]);

  // Track current page while scrolling
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pageSizes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setCurrentPage(Number((vis.target as HTMLElement).dataset.page));
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [pageSizes]);

  const scrollToPoint = useCallback(
    (page: number, y: number) => {
      const root = scrollRef.current;
      const el = pageRefs.current[page - 1];
      if (!root || !el) return;
      const top = el.offsetTop + y * scale - root.clientHeight / 3;
      root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    },
    [scale],
  );

  // Scroll to the selected transaction
  const selected = transactions.find((t) => t.id === selectedId);
  useEffect(() => {
    if (selected?.pdfCoords && pageSizes.length) scrollToPoint(selected.pdfCoords.page, selected.pdfCoords.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pageSizes.length]);

  // Search
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { page: number; x: number; y: number; w: number; h: number }[] = [];
    for (const p of textPages)
      for (const it of p.items) {
        const s = it.str.toLowerCase();
        let idx = s.indexOf(q);
        while (idx >= 0) {
          const charW = it.str.length ? it.width / it.str.length : 0;
          out.push({ page: p.page, x: it.x + idx * charW, y: it.baseline - it.height * 0.85, w: Math.max(4, q.length * charW), h: it.height * 1.1 });
          idx = s.indexOf(q, idx + q.length);
        }
      }
    return out;
  }, [query, textPages]);

  useEffect(() => {
    setMatchIdx(0);
  }, [query]);
  useEffect(() => {
    const m = matches[matchIdx];
    if (m) scrollToPoint(m.page, m.y);
  }, [matchIdx, matches, scrollToPoint]);

  const byPage = useMemo(() => {
    const m = new Map<number, AnalysedTransaction[]>();
    for (const t of transactions) {
      if (!t.pdfCoords) continue;
      const visible = !onlyClaimed || t.status === 'included' || t.id === selectedId;
      if (!visible) continue;
      m.set(t.pdfCoords.page, [...(m.get(t.pdfCoords.page) ?? []), t]);
    }
    return m;
  }, [transactions, onlyClaimed, selectedId]);

  const zoom = (d: number) => {
    setFitWidth(false);
    setScale((s) => Math.max(0.5, Math.min(3, Math.round((s + d) * 100) / 100)));
  };
  const goPage = (p: number) => {
    const el = pageRefs.current[p - 1];
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="flex items-center gap-0.5">
          <button className="btn-ghost p-1.5!" onClick={() => zoom(-0.15)} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <span className="num w-12 text-center text-xs">{Math.round(scale * 100)}%</span>
          <button className="btn-ghost p-1.5!" onClick={() => zoom(0.15)} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
          <button className={cx('btn-ghost p-1.5!', fitWidth && 'text-blue-600!')} onClick={() => setFitWidth(true)} title="Fit width" aria-label="Fit width"><Maximize2 className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-0.5 text-xs">
          <button className="btn-ghost p-1.5!" disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <span className="num">{currentPage} / {pageSizes.length || '–'}</span>
          <button className="btn-ghost p-1.5!" disabled={currentPage >= pageSizes.length} onClick={() => goPage(currentPage + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="input py-1.5! pr-24! pl-8! text-xs!"
            placeholder="Search PDF text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length) setMatchIdx((i) => (i + (e.shiftKey ? -1 + matches.length : 1)) % matches.length);
            }}
          />
          {query.length >= 2 && (
            <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 text-[11px] text-slate-500">
              <span className="num">{matches.length ? matchIdx + 1 : 0}/{matches.length}</span>
              <button className="btn-ghost p-0.5!" onClick={() => matches.length && setMatchIdx((i) => (i - 1 + matches.length) % matches.length)} aria-label="Previous match"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button className="btn-ghost p-0.5!" onClick={() => matches.length && setMatchIdx((i) => (i + 1) % matches.length)} aria-label="Next match"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button className="btn-ghost p-0.5!" onClick={() => setQuery('')} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
        <Toggle checked={onlyClaimed} onChange={(v) => updateSettings({ onlyHighlightClaimed: v })} label={<span className="text-xs">Only highlight claimed tolls</span>} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-b border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800">
        <Legend cls="bg-emerald-400/40 border-emerald-600" label="Included in claim" />
        {!onlyClaimed && <Legend cls="bg-amber-300/50 border-amber-500" label="Requires review" />}
        {!onlyClaimed && <Legend cls="bg-slate-400/40 border-slate-500" label="Excluded / personal" />}
        <span className="ml-auto hidden sm:inline">Click a highlight to claim or exclude</span>
      </div>

      {/* Pages */}
      <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-auto bg-slate-200/70 p-4 dark:bg-slate-950" onClick={() => setPopoverId(null)}>
        {error && <div className="mx-auto max-w-md rounded-lg bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        {!pdf && !error && (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering original statement…
          </div>
        )}
        {pageSizes.map((sz, i) => {
          const page = i + 1;
          return (
            <div
              key={page}
              data-page={page}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
              className="relative mx-auto mb-4 bg-white shadow-md ring-1 ring-black/5"
              style={{ width: sz.w * scale, height: sz.h * scale }}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
                className="absolute inset-0 h-full w-full"
              />
              {matches.map((m, mi) =>
                m.page === page ? (
                  <div
                    key={`m${mi}`}
                    className={cx('pointer-events-none absolute rounded-sm', mi === matchIdx ? 'bg-blue-500/35 ring-2 ring-blue-500' : 'bg-blue-400/25')}
                    style={{ left: m.x * scale, top: m.y * scale, width: m.w * scale, height: m.h * scale }}
                  />
                ) : null,
              )}
              {(byPage.get(page) ?? []).map((t) => {
                const c = t.pdfCoords!;
                const isSel = t.id === selectedId;
                return (
                  <div key={t.id}>
                    <button
                      type="button"
                      aria-label={`${t.tollPoint} ${money(t.amount)} — ${t.status}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(t.id);
                        setPopoverId(t.id);
                      }}
                      className={cx(
                        'absolute cursor-pointer rounded-[2px] border transition-[box-shadow,background-color] hover:ring-2 hover:ring-blue-400/60',
                        HL_STYLE[t.status],
                        isSel && 'pulse-ring z-10 ring-2 ring-blue-600',
                      )}
                      style={{ left: (c.x - 3) * scale, top: c.y * scale, width: (c.width + 6) * scale, height: c.height * scale }}
                    />
                    {t.status === 'included' && (
                      <span
                        className="pointer-events-none absolute grid place-items-center rounded-full bg-emerald-600 text-white"
                        style={{ left: Math.max(1, c.x - 13) * scale, top: (c.baseline - 6.4) * scale, width: 6.4 * scale, height: 6.4 * scale }}
                      >
                        <Check style={{ width: 5 * scale, height: 5 * scale }} strokeWidth={3.5} />
                      </span>
                    )}
                    {popoverId === t.id && (
                      <Popover
                        t={t}
                        style={{ left: Math.min(c.x * scale, sz.w * scale - 290), top: (c.y + c.height + 4) * scale }}
                        onClaim={(v) => {
                          setIncluded([t.id], v);
                          setPopoverId(null);
                        }}
                        onRevert={() => {
                          setIncluded([t.id], undefined);
                          setPopoverId(null);
                        }}
                        onClose={() => setPopoverId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('h-2.5 w-4 rounded-[2px] border', cls)} />
      {label}
    </span>
  );
}

function Popover({
  t,
  style,
  onClaim,
  onRevert,
  onClose,
}: {
  t: AnalysedTransaction;
  style: React.CSSProperties;
  onClaim: (v: boolean) => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute z-20 w-[280px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900" style={style} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{t.tollPoint}</div>
          <div className="num text-xs text-slate-500">
            {fmtDate(t.date, 'EEE d MMM')} · {t.time} · {money(t.amount)}
          </div>
        </div>
        <button className="btn-ghost p-1!" onClick={onClose} aria-label="Close"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ConfidenceBadge value={t.confidence} manual={t.manual} />
        <StatusPill status={t.status} manual={t.manual} />
      </div>
      <p className="mt-2 line-clamp-3 text-[11px] text-slate-500">{t.reasons[t.manual ? 1 : 1] ?? t.reasons[0]}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-success btn-sm" onClick={() => onClaim(true)} disabled={t.status === 'included'}>
          <Check className="h-3.5 w-3.5" /> Claim
        </button>
        <button className="btn-secondary btn-sm" onClick={() => onClaim(false)} disabled={t.status === 'excluded'}>
          <Ban className="h-3.5 w-3.5" /> Exclude
        </button>
      </div>
      {t.manual && (
        <button className="btn-ghost btn-sm mt-1 w-full" onClick={onRevert}>
          <Undo2 className="h-3.5 w-3.5" /> Revert to AI decision
        </button>
      )}
    </div>
  );
}
