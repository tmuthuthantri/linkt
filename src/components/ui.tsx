import { useEffect, type ReactNode } from 'react';
import { CircleCheck, CircleSlash, CircleAlert, X } from 'lucide-react';
import type { ClaimStatus } from '../types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export const STATUS_META: Record<ClaimStatus, { label: string; pill: string; dot: string; row: string }> = {
  included: {
    label: 'Included',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
    dot: 'bg-emerald-500',
    row: 'bg-emerald-50/50 dark:bg-emerald-500/5',
  },
  review: {
    label: 'Review',
    pill: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
    dot: 'bg-amber-500',
    row: '',
  },
  excluded: {
    label: 'Excluded',
    pill: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-slate-500/30',
    dot: 'bg-slate-400',
    row: '',
  },
};

export function StatusPill({ status, manual }: { status: ClaimStatus; manual?: boolean }) {
  const m = STATUS_META[status];
  const Icon = status === 'included' ? CircleCheck : status === 'review' ? CircleAlert : CircleSlash;
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', m.pill)}>
      <Icon className="h-3 w-3" />
      {m.label}
      {manual && <span className="opacity-70">· manual</span>}
    </span>
  );
}

export function ConfidenceBadge({ value, manual }: { value: number; manual?: boolean }) {
  const tone = manual
    ? 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/10'
    : value >= 95
      ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10'
      : value >= 80
        ? 'text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-500/10'
        : value >= 50
          ? 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10'
          : 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
  const bar = manual ? 'bg-blue-500' : value >= 95 ? 'bg-emerald-500' : value >= 80 ? 'bg-teal-500' : value >= 50 ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold', tone)} title={manual ? 'Manual decision' : 'AI recommendation confidence'}>
      <span className="relative h-1.5 w-8 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <span className={cx('absolute inset-y-0 left-0 rounded-full', bar)} style={{ width: `${value}%` }} />
      </span>
      <span className="num">{value}%</span>
    </span>
  );
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet'; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

const modalStack: object[] = [];

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const token = {};
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most modal responds, so stacked dialogs close one at a time.
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = size === 'md' ? 'max-w-lg' : size === 'lg' ? 'max-w-3xl' : 'max-w-5xl';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900', width)}>
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          {icon && <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button className="btn-ghost -mr-2 p-1.5!" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
    </label>
  );
}

export function EmptyState({ icon, title, body, actions }: { icon: ReactNode; title: string; body: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{body}</div>
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</h3>
      {right}
    </div>
  );
}
