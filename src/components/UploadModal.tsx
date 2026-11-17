import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, FileUp, Loader2, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { extractFromPdfBytes } from '../utils/pdfExtractor';
import { uid, money, fmtDate } from '../utils/format';
import { getAnalysisSnapshot } from '../hooks/useAnalysis';
import type { StatementDocument } from '../types';
import { Modal, cx } from './ui';

interface FileJob {
  key: string;
  name: string;
  size: number;
  state: 'queued' | 'parsing' | 'done' | 'error' | 'duplicate';
  message?: string;
  count?: number;
  amount?: number;
}

export default function UploadModal() {
  const open = useTollStore((s) => s.modal === 'upload');
  const close = useTollStore((s) => s.closeModal);
  const statements = useTollStore((s) => s.statements);
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<FileJob>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  const processFiles = useCallback(async (files: { name: string; size: number; bytes: () => Promise<Uint8Array> }[]) => {
    if (!files.length) return;
    setBusy(true);
    const newJobs = files.map((f) => ({ key: uid('job'), name: f.name, size: f.size, state: 'queued' as const }));
    setJobs((js) => [...newJobs, ...js]);
    let imported = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const job = newJobs[i];
      const st = useTollStore.getState();
      if (st.statements.some((s) => s.fileName === f.name && s.fileSize === f.size)) {
        patch(job.key, { state: 'duplicate', message: 'Already uploaded — skipped' });
        continue;
      }
      patch(job.key, { state: 'parsing' });
      try {
        const bytes = await f.bytes();
        const id = uid('stmt');
        const result = await extractFromPdfBytes(bytes, { statementId: id, vehicles: st.settings.vehicles, tags: st.settings.tags });
        if (result.invoiceRef && st.statements.some((s) => s.invoiceRef === result.invoiceRef)) {
          patch(job.key, { state: 'duplicate', message: `Invoice ${result.invoiceRef} already imported — skipped` });
          continue;
        }
        if (!result.transactions.length) {
          patch(job.key, {
            state: 'error',
            message: 'No toll transactions found. Is this a text-based Linkt statement or tax invoice (not a scanned image)?',
          });
          continue;
        }
        const doc: StatementDocument = {
          id,
          fileName: f.name,
          fileSize: f.size,
          uploadedAt: new Date().toISOString(),
          pageCount: result.pageCount,
          invoiceRef: result.invoiceRef,
          accountNumber: result.accountNumber,
          periodStart: result.periodStart,
          periodEnd: result.periodEnd,
          transactionCount: result.transactions.length,
          excludedLineCount: result.excludedLineCount,
        };
        await st.addStatement(doc, result.transactions, bytes);
        imported++;
        patch(job.key, {
          state: 'done',
          count: result.transactions.length,
          amount: result.transactions.reduce((s, t) => s + t.amount, 0),
          message: `${result.pageCount} page(s) · ${result.excludedLineCount} payment/surcharge lines ignored${result.periodStart ? ` · ${fmtDate(result.periodStart, 'd MMM')} – ${fmtDate(result.periodEnd!, 'd MMM yyyy')}` : ''}`,
        });
      } catch (err) {
        console.error(err);
        patch(job.key, { state: 'error', message: err instanceof Error ? err.message : 'Could not read this PDF' });
      }
    }
    if (imported) {
      const a = getAnalysisSnapshot();
      useTollStore
        .getState()
        .log(
          'analysis',
          'AI work-travel analysis completed',
          `${a.totals.totalCount} transactions scored · ${a.totals.claimCount} auto-selected (${money(a.totals.claimAmount)}) · ${a.totals.officeDays} likely office-attendance days · ${a.transactions.filter((t) => t.status === 'review').length} need review`,
        );
    }
    setBusy(false);
  }, []);

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const pdfs = [...list].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    void processFiles(pdfs.map((f) => ({ name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) })));
  };

  const loadSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-toll-statement.pdf`);
    const buf = new Uint8Array(await res.arrayBuffer());
    void processFiles([{ name: 'sample-toll-statement.pdf', size: buf.byteLength, bytes: async () => buf }]);
  };

  const doneCount = jobs.filter((j) => j.state === 'done').length;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload Linkt statements"
      subtitle="PDF statements and tax invoices are processed entirely in your browser — nothing is uploaded to a server."
      icon={<FileUp className="h-5 w-5" />}
      footer={
        <>
          {doneCount > 0 && <span className="mr-auto text-sm text-emerald-700 dark:text-emerald-400">{doneCount} statement(s) imported and analysed</span>}
          <button className="btn-secondary" onClick={close}>
            {doneCount ? 'Done' : 'Close'}
          </button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
        )}
      >
        <UploadCloud className={cx('mb-3 h-10 w-10', dragging ? 'text-blue-600' : 'text-slate-400')} />
        <p className="text-sm font-medium">Drag & drop Linkt PDF statements here</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">or click to browse · multiple files supported</p>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Payments (cr), card surcharges and summary totals are excluded automatically.</span>
        <button className="btn-ghost btn-sm" onClick={loadSample} disabled={busy}>
          <Sparkles className="h-3.5 w-3.5" /> Try a sample statement
        </button>
      </div>

      {jobs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {jobs.map((j) => (
            <li key={j.key} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <div className="mt-0.5">
                {j.state === 'parsing' || j.state === 'queued' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : j.state === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className={cx('h-4 w-4', j.state === 'duplicate' ? 'text-amber-500' : 'text-rose-600')} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{j.name}</span>
                  {j.count !== undefined && (
                    <span className="num shrink-0 text-xs text-slate-600 dark:text-slate-300">
                      {j.count} tolls · {money(j.amount ?? 0)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{j.state === 'parsing' ? 'Extracting toll rows and exact PDF coordinates…' : j.state === 'queued' ? 'Waiting…' : j.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {statements.length > 0 && <StatementList />}
    </Modal>
  );
}

function StatementList() {
  const statements = useTollStore((s) => s.statements);
  const removeStatement = useTollStore((s) => s.removeStatement);
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Imported statements</h4>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {statements.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{s.fileName}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {s.transactionCount} tolls · {s.pageCount} pages{s.invoiceRef ? ` · Inv ${s.invoiceRef}` : ''}
                {s.periodStart ? ` · ${fmtDate(s.periodStart, 'd MMM')} – ${fmtDate(s.periodEnd!, 'd MMM yyyy')}` : ''}
              </div>
            </div>
            <button
              className="btn-ghost btn-sm text-rose-600!"
              onClick={() => {
                if (confirm(`Remove ${s.fileName} and its ${s.transactionCount} transactions?`)) void removeStatement(s.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
