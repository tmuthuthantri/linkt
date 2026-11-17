import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTollStore } from './store/useTollStore';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import TransactionsView from './components/TransactionsView';
import SplitView from './components/SplitView';
import CalendarView from './components/CalendarView';
import UploadModal from './components/UploadModal';
import SettingsModal from './components/SettingsModal';
import ExportModal from './components/ExportModal';
import AuditTrailModal from './components/AuditTrailModal';
import ResetConfirmModal from './components/ResetConfirmModal';

export default function App() {
  const hydrated = useTollStore((s) => s.hydrated);
  const theme = useTollStore((s) => s.settings.theme);
  const view = useTollStore((s) => s.view);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your saved data…
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className={view === 'split' ? 'flex-1 px-3 py-3 sm:px-4' : 'mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6'}>
        {view === 'dashboard' && <DashboardView />}
        {view === 'transactions' && <TransactionsView />}
        {view === 'split' && <SplitView />}
        {view === 'calendar' && <CalendarView />}
      </main>
      <UploadModal />
      <SettingsModal />
      <ExportModal />
      <AuditTrailModal />
      <ResetConfirmModal />
    </div>
  );
}
