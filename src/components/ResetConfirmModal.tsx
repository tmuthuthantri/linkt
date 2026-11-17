import { useState } from 'react';
import { AlertOctagon, Eraser, Loader2, RotateCcw } from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import { Modal, cx } from './ui';

export default function ResetConfirmModal() {
  const open = useTollStore((s) => s.modal === 'reset');
  const close = useTollStore((s) => s.closeModal);
  const clearStatementData = useTollStore((s) => s.clearStatementData);
  const factoryReset = useTollStore((s) => s.factoryReset);
  const statements = useTollStore((s) => s.statements.length);
  const txns = useTollStore((s) => s.transactions.length);
  const [mode, setMode] = useState<'data' | 'factory'>('data');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const needsTyping = mode === 'factory';
  const canGo = !needsTyping || confirmText.trim().toUpperCase() === 'RESET';

  const go = async () => {
    setBusy(true);
    if (mode === 'data') await clearStatementData();
    else await factoryReset();
    setBusy(false);
    setConfirmText('');
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="Clear data or reset"
      subtitle="Everything is stored only in this browser. Choose what to wipe."
      icon={<RotateCcw className="h-5 w-5" />}
      footer={
        <>
          <button className="btn-secondary" onClick={close}>Cancel</button>
          <button className="btn-danger" disabled={!canGo || busy} onClick={go}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'data' ? 'Clear statement data' : 'Factory reset'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <Option
          active={mode === 'data'}
          onClick={() => setMode('data')}
          icon={<Eraser className="h-5 w-5" />}
          title="Clear statement data"
          body={`Removes ${statements} uploaded statement(s), ${txns} transactions and all claim decisions & notes. Keeps your profile, rosters, leave, vehicles and tag numbers.`}
        />
        <Option
          active={mode === 'factory'}
          onClick={() => setMode('factory')}
          icon={<AlertOctagon className="h-5 w-5" />}
          title="Factory reset"
          body="Wipes everything — statements, settings, rosters, tag numbers, overrides and the audit trail — and returns the app to a fresh install."
          danger
        />
      </div>
      {needsTyping && (
        <div className="mt-4">
          <label className="label" htmlFor="reset-confirm">Type RESET to confirm</label>
          <input id="reset-confirm" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" autoComplete="off" />
        </div>
      )}
    </Modal>
  );
}

function Option({ active, onClick, icon, title, body, danger }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        active ? (danger ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10' : 'border-blue-500 bg-blue-50 dark:bg-blue-500/10') : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
      )}
    >
      <span className={cx('mt-0.5', danger ? 'text-rose-600' : 'text-blue-600')}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{body}</span>
      </span>
    </button>
  );
}
