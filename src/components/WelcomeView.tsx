import { Check, Download, FileSearch, FileUp, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { cx } from './ui';

/** Rows of the product mock — the same layout a Linkt statement uses. */
const MOCK_ROWS: { date: string; time: string; point: string; amount: string; state: 'in' | 'review' | 'none' }[] = [
  { date: '03 Sep', time: '07:39', point: 'Logan Mwy Stapylton Rd Entry East', amount: '$2.66', state: 'in' },
  { date: '03 Sep', time: '07:46', point: 'Gateway Ext Kuraby North', amount: '$3.45', state: 'in' },
  { date: '03 Sep', time: '07:56', point: 'Gateway Ext Compton Rd North', amount: '$2.12', state: 'in' },
  { date: '04 Sep', time: '13:33', point: 'Gateway Mwy Murarrie North', amount: '$4.98', state: 'review' },
  { date: '03 Sep', time: '17:36', point: 'Gateway Ext Compton Rd South', amount: '$2.12', state: 'in' },
  { date: '06 Sep', time: '10:21', point: 'Logan Mwy Loganlea Rd East', amount: '$3.12', state: 'none' },
  { date: '14 Sep', time: '', point: 'Payment - thank you', amount: '$50.00 cr', state: 'none' },
];

export default function WelcomeView() {
  const openModal = useTollStore((s) => s.openModal);

  const openSample = () => {
    openModal('upload');
    // The upload dialog owns the sample loader; click it once the dialog has mounted.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-action="load-sample"]')?.click()),
    );
  };

  return (
    <div className="space-y-10 pb-6 lg:-mt-6">
      {/* Hero */}
      <section className="grid items-center gap-10 pt-2 lg:min-h-[calc(100vh-88px)] lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <div className="enter max-w-xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Statements are read in your browser and kept on this device only.
          </div>
          <h1 className="display text-4xl leading-[1.05] text-slate-900 sm:text-5xl lg:text-[3.4rem] dark:text-white">
            Linkt toll claims for Australian employees, built from your own statements
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
            Drop in a Linkt statement or tax invoice. Each toll is read off the PDF, checked against your roster, leave and public holidays, and the work
            trips are marked on the original page.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Payments, card surcharges and totals stay out of the claim. GST is shown at one eleventh of each toll.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button className="btn-primary px-5! py-3! text-base!" onClick={() => openModal('upload')}>
              <Upload className="h-4.5 w-4.5" /> Upload statements
            </button>
            <button className="btn-secondary px-5! py-3! text-base!" onClick={openSample}>
              <Sparkles className="h-4.5 w-4.5 text-blue-600" /> Open the sample statement
            </button>
          </div>
        </div>

        <StatementMock />
      </section>

      {/* Steps */}
      <section aria-labelledby="steps-h">
        <h2 id="steps-h" className="display mb-5 text-2xl text-slate-900 dark:text-white">
          Three steps from statement to claim
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            { icon: FileUp, title: 'Upload the statement', body: 'PDF statements and tax invoices, one or many at once.', onClick: () => openModal('upload') },
            { icon: FileSearch, title: 'Check the marked tolls', body: 'Green rows go in the claim. Amber rows wait for your call.', onClick: openSample },
            { icon: Download, title: 'Export the claim package', body: 'A marked-up statement, a claim report with a signature block, Excel and CSV.', onClick: openSample },
          ].map(({ icon: Icon, title, body, onClick }, i) => (
            <li key={title}>
              <button onClick={onClick} className="card lift group flex h-full w-full items-start gap-4 p-5 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="num text-xs text-slate-400">0{i + 1}</span>
                  <span className="mt-0.5 block font-medium text-slate-900 dark:text-white">{title}</span>
                  <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{body}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** A live HTML rendition of the PDF review screen: the product itself, not an illustration. */
function StatementMock() {
  return (
    <div className="enter relative [animation-delay:120ms]" aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgb(31_48_56/0.35)] dark:border-slate-800 dark:bg-slate-900">
        {/* window bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="ml-3 truncate text-xs font-medium text-slate-500">PDF review · Tax invoice TI-20261031</span>
          <span className="ml-auto hidden items-center gap-1.5 rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200 sm:inline-flex dark:bg-slate-900 dark:ring-slate-700">
            <span className="h-2 w-3 rounded-[2px] border border-emerald-600 bg-emerald-400/40" /> Only claimed tolls
          </span>
        </div>

        {/* statement page */}
        <div className="bg-slate-100 p-4 sm:p-6 dark:bg-slate-950">
          <div className="rounded-sm bg-white p-4 text-[#1a1a1a] shadow-sm sm:p-6">
            <div className="text-[15px] font-semibold tracking-tight">Toll Account Statement &amp; Tax Invoice</div>
            <div className="mt-1 flex flex-wrap gap-x-6 text-[11px] text-neutral-500">
              <span>Account 4410 2287 31</span>
              <span>Tag 21130132976</span>
              <span>01 Sep – 31 Oct 2026</span>
            </div>
            <div className="mt-4 grid grid-cols-[3.4rem_2.8rem_1fr_auto] gap-x-3 border-b border-neutral-300 pb-1 text-[10.5px] font-semibold sm:grid-cols-[3.8rem_3rem_1fr_auto]">
              <span>Date</span>
              <span>Time</span>
              <span>Toll point</span>
              <span className="text-right">Amount</span>
            </div>
            <ul className="mt-1">
              {MOCK_ROWS.map((r, i) => (
                <li
                  key={i}
                  className={cx(
                    'relative grid grid-cols-[3.4rem_2.8rem_1fr_auto] gap-x-3 rounded-[2px] border px-1 py-[3px] text-[11px] sm:grid-cols-[3.8rem_3rem_1fr_auto]',
                    r.state === 'in' && 'border-emerald-600/60 bg-emerald-400/25',
                    r.state === 'review' && 'border-amber-500/70 bg-amber-300/35',
                    r.state === 'none' && 'border-transparent',
                  )}
                >
                  {r.state === 'in' && (
                    <span className="absolute top-1/2 -left-3.5 grid h-2.5 w-2.5 -translate-y-1/2 place-items-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-2 w-2" strokeWidth={4} />
                    </span>
                  )}
                  <span>{r.date}</span>
                  <span className="num">{r.time}</span>
                  <span className="truncate">{r.point}</span>
                  <span className="num text-right">{r.amount}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* claim strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div>
            <div className="text-[11px] text-slate-500">Claim total</div>
            <div className="num text-xl font-semibold text-slate-900 dark:text-white">$543.18</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">GST</div>
            <div className="num text-sm font-medium">$49.38</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Tolls</div>
            <div className="num text-sm font-medium">198 of 227</div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
            <Download className="h-3.5 w-3.5" /> Export claim
          </span>
        </div>
      </div>
    </div>
  );
}
