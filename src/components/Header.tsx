import { CalendarDays, Columns2, Download, History, LayoutDashboard, Moon, RotateCcw, Settings, Sun, Table2, Upload } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import type { ViewKey } from '../types';
import { cx } from './ui';
import { useAnalysis } from '../hooks/useAnalysis';
import { money } from '../utils/format';

const NAV: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', icon: Table2 },
  { key: 'split', label: 'PDF Review', icon: Columns2 },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
];

export default function Header() {
  const view = useTollStore((s) => s.view);
  const setView = useTollStore((s) => s.setView);
  const openModal = useTollStore((s) => s.openModal);
  const theme = useTollStore((s) => s.settings.theme);
  const updateSettings = useTollStore((s) => s.updateSettings);
  const hasData = useTollStore((s) => s.transactions.length > 0);
  const { totals } = useAnalysis();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-sm">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <path d="M8 25 L15 7 h2 l7 18" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d="M16 12v2.5M16 18v2.5" stroke="#6ee7b7" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">Linkt Toll Reimbursement Assistant</div>
            <div className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
              {hasData ? (
                <>
                  Claim <span className="num font-medium text-emerald-600 dark:text-emerald-400">{money(totals.claimAmount, true)}</span> · {totals.claimCount} tolls
                </>
              ) : (
                'Work travel toll claims, made audit-ready'
              )}
            </div>
          </div>
        </div>

        <nav className="ml-4 hidden items-center gap-1 rounded-lg bg-slate-100 p-1 lg:flex dark:bg-slate-800">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === key ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button className="btn-primary" onClick={() => openModal('upload')}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <button className="btn-success" onClick={() => openModal('export')} disabled={!hasData}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button className="btn-ghost p-2!" title="Audit trail" aria-label="Audit trail" onClick={() => openModal('audit')}>
            <History className="h-4.5 w-4.5" />
          </button>
          <button className="btn-ghost p-2!" title="Settings" aria-label="Settings" onClick={() => openModal('settings')}>
            <Settings className="h-4.5 w-4.5" />
          </button>
          <button className="btn-ghost p-2!" title="Clear data / reset" aria-label="Clear data or reset" onClick={() => openModal('reset')}>
            <RotateCcw className="h-4.5 w-4.5" />
          </button>
          <button
            className="btn-ghost p-2!"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle theme"
            onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
          >
            {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-200 px-3 py-1.5 lg:hidden dark:border-slate-800">
        {NAV.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
              view === key ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
