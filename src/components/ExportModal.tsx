import { useState } from 'react';
import confetti from 'canvas-confetti';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Highlighter, Loader2, Sheet } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { useAnalysis } from '../hooks/useAnalysis';
import type { HighlightStyle } from '../types';
import { downloadBlob, fileSafe, money } from '../utils/format';
import { Modal, Toggle, cx } from './ui';

const STYLES: { key: HighlightStyle; name: string; desc: string; swatch: string }[] = [
  { key: 'emerald', name: 'Subtle Emerald Highlighter', desc: 'Translucent green band + margin tick', swatch: 'bg-emerald-400/40' },
  { key: 'yellow', name: 'Classic Yellow Highlighter', desc: 'Traditional highlighter look', swatch: 'bg-yellow-300/70' },
  { key: 'margin', name: 'Left Margin Strip Only', desc: 'Statement text untouched', swatch: 'border-l-4 border-emerald-600 bg-transparent' },
];

export default function ExportModal() {
  const open = useTollStore((s) => s.modal === 'export');
  const close = useTollStore((s) => s.closeModal);
  const statements = useTollStore((s) => s.statements);
  const settings = useTollStore((s) => s.settings);
  const updateSettings = useTollStore((s) => s.updateSettings);
  const log = useTollStore((s) => s.log);
  const openModal = useTollStore((s) => s.openModal);
  const { transactions, days, totals } = useAnalysis();

  const [stmtIds, setStmtIds] = useState<string[] | null>(null);
  const [onlyClaimed, setOnlyClaimed] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = stmtIds ?? statements.map((s) => s.id);
  const reviewCount = transactions.filter((t) => t.status === 'review').length;
  const p = settings.profile;
  const profileMissing = !p.employeeName || !p.managerName;
  const who = fileSafe(p.employeeName || 'employee');
  const stamp = new Date().toISOString().slice(0, 10);

  const celebrate = () => {
    void confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#059669', '#2563eb', '#34d399', '#93c5fd'], disableForReducedMotion: true });
  };

  const run = async (key: string, label: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(label);
      celebrate();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const reportInput = () => ({ transactions, days, statements, settings, submissionNotes: notes });

  const exportHighlighted = () =>
    run('hl', 'Highlighted statement PDF downloaded', async () => {
      const { exportHighlightedPdf } = await import('../utils/highlightedPdfExporter');
      const stmts = statements.filter((s) => chosen.includes(s.id));
      if (!stmts.length) throw new Error('Choose at least one statement');
      const blob = await exportHighlightedPdf({
        statements: stmts,
        transactions,
        settings,
        style: settings.highlightStyle,
        onlyClaimed,
        includeHeader,
        onProgress: (d, t) => setProgress(`Rendering page ${d} of ${t}…`),
      });
      downloadBlob(blob, `${who}_highlighted_toll_statement_${stamp}.pdf`);
      log('export', `Exported highlighted statement PDF (${stmts.length} statement(s), ${STYLES.find((s) => s.key === settings.highlightStyle)?.name})`, onlyClaimed ? 'Claimed tolls only' : 'All statuses highlighted');
    });

  const exportReport = (kind: 'pdf' | 'xlsx' | 'csv' | 'csv-all') =>
    run(kind, `${kind === 'pdf' ? 'PDF claim report' : kind === 'xlsx' ? 'Excel workbook' : 'CSV file'} downloaded`, async () => {
      const r = await import('../utils/reportExporter');
      const input = reportInput();
      if (kind === 'pdf') downloadBlob(r.exportPdfReport(input), `${who}_toll_reimbursement_claim_${stamp}.pdf`);
      if (kind === 'xlsx') downloadBlob(r.exportExcel(input), `${who}_toll_reimbursement_claim_${stamp}.xlsx`);
      if (kind === 'csv') downloadBlob(r.exportCsv(input, 'claimed'), `${who}_toll_claim_items_${stamp}.csv`);
      if (kind === 'csv-all') downloadBlob(r.exportCsv(input, 'all'), `${who}_all_toll_transactions_${stamp}.csv`);
      log('export', `Exported ${kind.toUpperCase()} reimbursement report`, `${totals.claimCount} tolls · ${money(totals.claimAmount, true)}`);
    });

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Export claim package"
      subtitle={`${totals.claimCount} tolls selected · ${money(totals.claimAmount, true)} incl. GST ${money(totals.claimGst)}`}
      icon={<Download className="h-5 w-5" />}
      footer={
        <>
          {done && (
            <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {done}
            </span>
          )}
          {error && <span className="mr-auto text-sm text-rose-600">{error}</span>}
          <button className="btn-secondary" onClick={close}>Close</button>
        </>
      }
    >
      {(reviewCount > 0 || profileMissing || totals.claimCount === 0) && (
        <div className="mb-4 space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {totals.claimCount === 0 && <Warn>No tolls are selected for the claim yet.</Warn>}
          {reviewCount > 0 && <Warn>{reviewCount} tolls still require review — they won't be included unless you claim them.</Warn>}
          {profileMissing && (
            <Warn>
              Employee or manager details are incomplete.{' '}
              <button className="font-semibold underline" onClick={() => openModal('settings', 'profile')}>Complete profile</button>
            </Warn>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Highlighted PDF */}
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <Highlighter className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">Highlighted original statement</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            A copy of your original Linkt PDF with claimed tolls highlighted and ticked in the left margin. Dollar amounts are never covered.
          </p>

          <div className="label">Highlight style</div>
          <div className="mb-3 grid gap-2">
            {STYLES.map((s) => (
              <label
                key={s.key}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2',
                  settings.highlightStyle === s.key ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-700',
                )}
              >
                <input type="radio" name="hlstyle" className="accent-blue-600" checked={settings.highlightStyle === s.key} onChange={() => updateSettings({ highlightStyle: s.key })} />
                <span className={cx('h-4 w-10 rounded-sm', s.swatch)} />
                <span className="text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-slate-500">{s.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <Toggle checked={onlyClaimed} onChange={setOnlyClaimed} label="Highlight only tolls being claimed for" description="Keeps the statement uncluttered (recommended)" />
            <Toggle checked={includeHeader} onChange={setIncludeHeader} label="Add summary header & legend footer" description="Added as extra margin — original content is never covered" />
          </div>

          {statements.length > 1 && (
            <div className="mt-3">
              <div className="label">Statements</div>
              {statements.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={chosen.includes(s.id)}
                    onChange={(e) => setStmtIds(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))}
                  />
                  <span className="truncate">{s.fileName}</span>
                </label>
              ))}
            </div>
          )}

          <button className="btn-success mt-4 w-full" disabled={!!busy || !statements.length} onClick={exportHighlighted}>
            {busy === 'hl' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy === 'hl' ? progress || 'Preparing…' : 'Download highlighted PDF'}
          </button>
        </section>

        {/* Reports */}
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold">Reimbursement report</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            ATO-friendly claim with employee & manager details, GST (1/11th), invoice references, summary statistics and a manager approval signature block.
          </p>
          <label className="label" htmlFor="sub-notes">Employee submission notes (optional)</label>
          <textarea
            id="sub-notes"
            className="input min-h-[96px]"
            placeholder="e.g. Tolls incurred travelling between home and the Eagle Farm office on rostered days, plus two client site visits (see notes)."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-4 grid gap-2">
            <button className="btn-primary" disabled={!!busy || !totals.claimCount} onClick={() => exportReport('pdf')}>
              {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF claim report
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" disabled={!!busy || !totals.claimCount} onClick={() => exportReport('xlsx')}>
                {busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />} Excel (.xlsx)
              </button>
              <button className="btn-secondary" disabled={!!busy || !totals.claimCount} onClick={() => exportReport('csv')}>
                {busy === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />} CSV (claimed)
              </button>
            </div>
            <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => exportReport('csv-all')}>
              Export all transactions as CSV
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>{children}</span>
    </div>
  );
}
