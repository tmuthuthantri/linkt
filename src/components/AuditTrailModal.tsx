import { useMemo, useState } from 'react';
import { CalendarOff, Download, FileDown, FileUp, History, Brain, MousePointerClick, MessageSquareText, ListChecks, Settings, RotateCcw, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTollStore } from '../store/useTollStore';
import type { AuditEventType } from '../types';
import { downloadBlob } from '../utils/format';
import { toCsv } from '../utils/reportExporter';
import { Modal, cx } from './ui';

const META: Record<AuditEventType, { label: string; icon: typeof History; cls: string }> = {
  import: { label: 'Import', icon: FileUp, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  analysis: { label: 'AI analysis', icon: Brain, cls: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  override: { label: 'Override', icon: MousePointerClick, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  note: { label: 'Note', icon: MessageSquareText, cls: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  bulk: { label: 'Bulk action', icon: ListChecks, cls: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400' },
  settings: { label: 'Settings', icon: Settings, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  export: { label: 'Export', icon: FileDown, cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  reset: { label: 'Reset', icon: RotateCcw, cls: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  'leave-import': { label: 'Leave import', icon: CalendarOff, cls: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  delete: { label: 'Removed', icon: Trash2, cls: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
};

export default function AuditTrailModal() {
  const open = useTollStore((s) => s.modal === 'audit');
  const close = useTollStore((s) => s.closeModal);
  const audit = useTollStore((s) => s.audit);
  const [type, setType] = useState<'' | AuditEventType>('');

  const list = useMemo(() => [...audit].reverse().filter((e) => !type || e.type === type), [audit, type]);
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={close}
      title="Audit trail"
      subtitle="Chronological record of imports, AI analyses, overrides, notes, settings changes and exports."
      icon={<History className="h-5 w-5" />}
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">{audit.length} events recorded</span>
          <button className="btn-secondary" disabled={!audit.length} onClick={() => void downloadBlob(new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' }), `toll_claim_audit_${stamp}.json`).catch(() => {})}>
            <Download className="h-4 w-4" /> JSON
          </button>
          <button
            className="btn-secondary"
            disabled={!audit.length}
            onClick={() =>
              void downloadBlob(
                new Blob(['﻿' + toCsv(audit.map((e) => ({ Timestamp: e.timestamp, Type: META[e.type].label, Event: e.message, Details: e.details ?? '' })))], { type: 'text/csv;charset=utf-8' }),
                `toll_claim_audit_${stamp}.csv`,
              ).catch(() => {})
            }
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['', ...Object.keys(META)] as ('' | AuditEventType)[]).map((k) => (
          <button
            key={k || 'all'}
            onClick={() => setType(k)}
            className={cx('rounded-full px-2.5 py-1 text-xs font-medium', type === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}
          >
            {k ? META[k].label : 'All'}
          </button>
        ))}
      </div>
      {!list.length ? (
        <div className="py-12 text-center text-sm text-slate-500">No audit events yet.</div>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-6 dark:border-slate-800">
          {list.map((e) => {
            const m = META[e.type];
            const Icon = m.icon;
            return (
              <li key={e.id} className="relative">
                <span className={cx('absolute top-0.5 -left-[35px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-white dark:ring-slate-900', m.cls)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{e.message}</span>
                  <time className="num text-[11px] text-slate-500">{format(parseISO(e.timestamp), 'd MMM yyyy, HH:mm:ss')}</time>
                </div>
                {e.details && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{e.details}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
