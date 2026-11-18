import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarOff,
  Car,
  Database,
  ImagePlus,
  Plus,
  Settings,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useTollStore } from '../store/useTollStore';
import type { HolidayRegion, LeaveType, RosterPattern, SaturdayRotation, UserSettings } from '../types';
import { getPublicHolidays } from '../utils/australianHolidays';
import { addDays, format, parseISO } from 'date-fns';
import { fmtDate, uid, WEEKDAYS_SHORT } from '../utils/format';
import { Modal, Toggle, cx } from './ui';

const TABS = [
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'roster', label: 'Roster & commute', icon: CalendarClock },
  { key: 'saturday', label: 'Saturday roster', icon: Sun },
  { key: 'leave', label: 'Leave & holidays', icon: CalendarOff },
  { key: 'vehicles', label: 'Vehicles & tags', icon: Car },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { key: 'data', label: 'Data', icon: Database },
] as const;

const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'RDO', 'Personal', 'Long Service', 'Training', 'Other'];

export default function SettingsModal() {
  const open = useTollStore((s) => s.modal === 'settings');
  const close = useTollStore((s) => s.closeModal);
  const tab = useTollStore((s) => s.settingsTab);
  const openModal = useTollStore((s) => s.openModal);
  const settings = useTollStore((s) => s.settings);
  const updateSettings = useTollStore((s) => s.updateSettings);
  const [draft, setDraft] = useState<UserSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Leave imported from a screenshot while Settings is open is saved straight to the store — pull it into the draft.
  useEffect(() => {
    if (open) setDraft((d) => ({ ...d, leaveDates: settings.leaveDates }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.leaveDates]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    const changed = (Object.keys(draft) as (keyof UserSettings)[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(settings[k]));
    updateSettings(draft, `Settings updated: ${changed.join(', ') || 'no changes'}`);
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Settings"
      subtitle="Your profile, roster and vehicles drive the AI work-travel detection. Saved locally in this browser."
      icon={<Settings className="h-5 w-5" />}
      footer={
        <>
          {dirty && <span className="mr-auto text-xs text-amber-600">Unsaved changes — analysis updates when you save</span>}
          <button className="btn-secondary" onClick={close}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!dirty}>Save settings</button>
        </>
      }
    >
      <div className="flex flex-col gap-4 md:flex-row">
        <nav className="scroll-thin flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => openModal('settings', key)}
              className={cx(
                'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                tab === key ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {tab === 'profile' && <ProfileTab draft={draft} set={set} />}
          {tab === 'roster' && <RosterTab draft={draft} set={set} />}
          {tab === 'saturday' && <SaturdayTab draft={draft} set={set} />}
          {tab === 'leave' && <LeaveTab draft={draft} set={set} />}
          {tab === 'vehicles' && <VehiclesTab draft={draft} set={set} />}
          {tab === 'preferences' && <PreferencesTab draft={draft} set={set} />}
          {tab === 'data' && <DataTab />}
        </div>
      </div>
    </Modal>
  );
}

type TabProps = { draft: UserSettings; set: <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => void };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function H({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{children}</h3>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

function ProfileTab({ draft, set }: TabProps) {
  const p = draft.profile;
  const f = (k: keyof typeof p, label: string, type = 'text', placeholder = '') => (
    <Field label={label}>
      <input className="input" type={type} value={p[k]} placeholder={placeholder} onChange={(e) => set('profile', { ...p, [k]: e.target.value })} />
    </Field>
  );
  return (
    <div className="space-y-6">
      <div>
        <H sub="Appears on your reimbursement report and highlighted statement header.">Employee</H>
        <div className="grid gap-3 sm:grid-cols-2">
          {f('employeeName', 'Full name', 'text', 'Alex Citizen')}
          {f('employeeId', 'Employee ID', 'text', 'E12345')}
          {f('email', 'Work email', 'email', 'alex@company.com.au')}
          {f('department', 'Department')}
          {f('costCenter', 'Cost centre', 'text', 'CC-4410')}
          {f('company', 'Company')}
        </div>
      </div>
      <div>
        <H sub="Your approving manager for the signature block.">Manager</H>
        <div className="grid gap-3 sm:grid-cols-2">
          {f('managerName', 'Manager name')}
          {f('managerTitle', 'Manager title')}
          {f('managerEmail', 'Manager email', 'email')}
        </div>
      </div>
      <div>
        <H sub="Public holidays for this region are excluded from work days automatically.">Public holiday region</H>
        <div className="flex flex-wrap gap-2">
          {(['QLD', 'NSW', 'VIC', 'National'] as HolidayRegion[]).map((r) => (
            <button key={r} onClick={() => set('holidayRegion', r)} className={cx('rounded-lg border px-4 py-2 text-sm font-medium', draft.holidayRegion === r ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700')}>
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RosterTab({ draft, set }: TabProps) {
  const active = draft.rosterPatterns.find((r) => r.id === draft.activeRosterId) ?? draft.rosterPatterns[0];
  const updateRoster = (patch: Partial<RosterPattern>) => set('rosterPatterns', draft.rosterPatterns.map((r) => (r.id === active.id ? { ...r, ...patch } : r)));
  const c = draft.commute;
  return (
    <div className="space-y-6">
      <div>
        <H sub="Select the pattern you work. Tolls on rostered days score higher.">Roster pattern</H>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.rosterPatterns.map((r) => (
            <label key={r.id} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-3', r.id === active.id ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-700')}>
              <input type="radio" className="mt-1 accent-blue-600" checked={r.id === active.id} onChange={() => set('activeRosterId', r.id)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.name}</span>
                <span className="block text-xs text-slate-500">{r.weekdays.map((w) => WEEKDAYS_SHORT[w]).join(', ')}</span>
              </span>
              {!r.id.startsWith('roster-') && (
                <button
                  className="btn-ghost p-1!"
                  aria-label="Delete roster"
                  onClick={(e) => {
                    e.preventDefault();
                    const rest = draft.rosterPatterns.filter((x) => x.id !== r.id);
                    set('rosterPatterns', rest);
                    if (draft.activeRosterId === r.id) set('activeRosterId', rest[0].id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
          ))}
        </div>
        <button
          className="btn-ghost btn-sm mt-2"
          onClick={() => {
            const r: RosterPattern = { id: uid('roster'), name: 'My custom roster', type: 'custom', weekdays: [1, 2, 3, 4, 5] };
            set('rosterPatterns', [...draft.rosterPatterns, r]);
            set('activeRosterId', r.id);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add custom roster
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Roster name">
            <input className="input" value={active.name} onChange={(e) => updateRoster({ name: e.target.value })} />
          </Field>
          <Field label="Type">
            <select className="input" value={active.type} onChange={(e) => updateRoster({ type: e.target.value as RosterPattern['type'] })}>
              <option value="full-time">Full time</option>
              <option value="hybrid">Hybrid</option>
              <option value="nine-day-fortnight">9-day fortnight</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <div className="label">Rostered office days</div>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((w) => {
              const on = active.weekdays.includes(w);
              return (
                <button
                  key={w}
                  onClick={() => updateRoster({ weekdays: on ? active.weekdays.filter((x) => x !== w) : [...active.weekdays, w].sort() })}
                  className={cx('w-12 rounded-lg border py-1.5 text-sm font-medium', on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 dark:border-slate-700')}
                >
                  {WEEKDAYS_SHORT[w]}
                </button>
              );
            })}
          </div>
        </div>
        {active.type === 'nine-day-fortnight' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="RDO weekday">
              <select className="input" value={active.rdoWeekday ?? 5} onChange={(e) => updateRoster({ rdoWeekday: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{WEEKDAYS_SHORT[w]}</option>)}
              </select>
            </Field>
            <Field label="A known RDO date (sets the fortnight)">
              <input type="date" className="input" value={active.rdoAnchorDate ?? ''} onChange={(e) => updateRoster({ rdoAnchorDate: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      <div>
        <H sub="Trips that start inside these windows on rostered days are treated as your commute.">Weekday commute windows</H>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Morning from"><input type="time" className="input" value={c.morningStart} onChange={(e) => set('commute', { ...c, morningStart: e.target.value })} /></Field>
          <Field label="Morning to"><input type="time" className="input" value={c.morningEnd} onChange={(e) => set('commute', { ...c, morningEnd: e.target.value })} /></Field>
          <Field label="Evening from"><input type="time" className="input" value={c.eveningStart} onChange={(e) => set('commute', { ...c, eveningStart: e.target.value })} /></Field>
          <Field label="Evening to"><input type="time" className="input" value={c.eveningEnd} onChange={(e) => set('commute', { ...c, eveningEnd: e.target.value })} /></Field>
        </div>
        <Field label={`Group tolls into one trip when less than ${c.tripGapMinutes} minutes apart`} className="mt-3 max-w-sm">
          <input type="range" min={10} max={90} step={5} className="w-full accent-blue-600" value={c.tripGapMinutes} onChange={(e) => set('commute', { ...c, tripGapMinutes: Number(e.target.value) })} />
        </Field>
      </div>
    </div>
  );
}

function SaturdayTab({ draft, set }: TabProps) {
  const s = draft.saturday;
  const u = (patch: Partial<typeof s>) => set('saturday', { ...s, ...patch });
  const [newDate, setNewDate] = useState('');
  return (
    <div className="space-y-5">
      <Toggle checked={s.enabled} onChange={(v) => u({ enabled: v })} label="I work rotating Saturday shifts" description="Saturday tolls on rostered Saturdays are scored as work travel using the Saturday windows below." />
      <div className={cx('space-y-5', !s.enabled && 'pointer-events-none opacity-50')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shift start"><input type="time" className="input" value={s.shiftStart} onChange={(e) => u({ shiftStart: e.target.value })} /></Field>
          <Field label="Shift end"><input type="time" className="input" value={s.shiftEnd} onChange={(e) => u({ shiftEnd: e.target.value })} /></Field>
          <Field label="Saturday morning window from"><input type="time" className="input" value={s.morningStart} onChange={(e) => u({ morningStart: e.target.value })} /></Field>
          <Field label="Saturday morning window to"><input type="time" className="input" value={s.morningEnd} onChange={(e) => u({ morningEnd: e.target.value })} /></Field>
          <Field label="Saturday return window from"><input type="time" className="input" value={s.eveningStart} onChange={(e) => u({ eveningStart: e.target.value })} /></Field>
          <Field label="Saturday return window to"><input type="time" className="input" value={s.eveningEnd} onChange={(e) => u({ eveningEnd: e.target.value })} /></Field>
        </div>
        <div>
          <div className="label">Rotation cycle</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['every', 'Every Saturday'],
              ['fortnightly-even', 'Fortnightly — even ISO weeks'],
              ['fortnightly-odd', 'Fortnightly — odd ISO weeks'],
              ['custom', 'Custom dates'],
            ] as [SaturdayRotation, string][]).map(([k, label]) => (
              <label key={k} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', s.rotation === k ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-700')}>
                <input type="radio" className="accent-blue-600" checked={s.rotation === k} onChange={() => u({ rotation: k })} /> {label}
              </label>
            ))}
          </div>
        </div>
        {s.rotation === 'custom' && (
          <div>
            <div className="label">Rostered Saturdays</div>
            <div className="flex gap-2">
              <input type="date" className="input max-w-[200px]" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <button
                className="btn-secondary"
                disabled={!newDate || parseISO(newDate).getDay() !== 6}
                onClick={() => {
                  if (!s.customDates.includes(newDate)) u({ customDates: [...s.customDates, newDate].sort() });
                  setNewDate('');
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            {newDate && parseISO(newDate).getDay() !== 6 && <p className="mt-1 text-xs text-amber-600">Pick a Saturday.</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.customDates.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                  {fmtDate(d, 'd MMM yyyy')}
                  <button onClick={() => u({ customDates: s.customDates.filter((x) => x !== d) })} aria-label={`Remove ${d}`}>×</button>
                </span>
              ))}
              {!s.customDates.length && <span className="text-xs text-slate-500">No Saturdays added yet.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeaveTab({ draft, set }: TabProps) {
  const [leave, setLeave] = useState({ date: '', to: '', type: 'Annual' as LeaveType, note: '', partial: false });
  const setLeaveImportOpen = useTollStore((s) => s.setLeaveImportOpen);
  const [oneOff, setOneOff] = useState({ date: '', note: '' });
  const [hol, setHol] = useState({ date: '', name: '' });
  const year = new Date().getFullYear();
  const holidays = useMemo(() => [...getPublicHolidays(year, draft.holidayRegion), ...getPublicHolidays(year + 1, draft.holidayRegion)], [year, draft.holidayRegion]);

  const addLeave = () => {
    const out = [...draft.leaveDates];
    const start = parseISO(leave.date);
    const end = leave.to ? parseISO(leave.to) : start;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const iso = format(d, 'yyyy-MM-dd');
      if (!out.some((l) => l.date === iso)) out.push({ id: uid('leave'), date: iso, type: leave.type, note: leave.note || undefined, partial: leave.partial || undefined, source: 'manual' });
    }
    set('leaveDates', out.sort((a, b) => a.date.localeCompare(b.date)));
    setLeave({ ...leave, date: '', to: '', note: '', partial: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Leave dates</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tolls on full leave days score below 50% and are excluded. Half-day leave keeps tolls claimable but flags them for review.</p>
          </div>
          <button className="btn-primary btn-sm" onClick={() => setLeaveImportOpen(true)}>
            <ImagePlus className="h-3.5 w-3.5" /> Import from screenshot
          </button>
        </div>
        {draft.leaveDates.length > 0 && (
          <div className="mb-2 flex justify-end">
            <button className="btn-ghost btn-sm text-rose-600!" onClick={() => confirm(`Remove all ${draft.leaveDates.length} leave days?`) && set('leaveDates', [])}>
              <Trash2 className="h-3.5 w-3.5" /> Clear all leave
            </button>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
          <input type="date" className="input" aria-label="Leave from" value={leave.date} onChange={(e) => setLeave({ ...leave, date: e.target.value })} />
          <input type="date" className="input" aria-label="Leave to (optional)" value={leave.to} min={leave.date} onChange={(e) => setLeave({ ...leave, to: e.target.value })} />
          <select className="input" value={leave.type} onChange={(e) => setLeave({ ...leave, type: e.target.value as LeaveType })}>
            {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="input" placeholder="Note (optional)" value={leave.note} onChange={(e) => setLeave({ ...leave, note: e.target.value })} />
          <button className="btn-secondary" disabled={!leave.date} onClick={addLeave}><Plus className="h-4 w-4" /> Add</button>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Set a “to” date to add a range of leave days at once.</p>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" className="accent-blue-600" checked={leave.partial} onChange={(e) => setLeave({ ...leave, partial: e.target.checked })} /> Half day / part day
          </label>
        </div>
        <DateList
          items={draft.leaveDates.map((l) => ({ id: l.id, date: l.date, label: `${l.partial ? '½ ' : ''}${l.type}${l.note ? ` — ${l.note}` : ''}${l.source === 'screenshot' ? ' 📷' : ''}` }))} onRemove={(id) => set('leaveDates', draft.leaveDates.filter((l) => l.id !== id))} tone="amber" />
      </div>

      <div>
        <H sub="Worked on a day you're not normally rostered? Add it so those tolls are treated as work travel.">One-off work days</H>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input type="date" className="input" aria-label="One-off work date" value={oneOff.date} onChange={(e) => setOneOff({ ...oneOff, date: e.target.value })} />
          <input className="input" placeholder="Reason (e.g. stocktake, client visit)" value={oneOff.note} onChange={(e) => setOneOff({ ...oneOff, note: e.target.value })} />
          <button
            className="btn-secondary"
            disabled={!oneOff.date}
            onClick={() => {
              set('oneOffWorkDays', [...draft.oneOffWorkDays.filter((o) => o.date !== oneOff.date), { id: uid('oneoff'), date: oneOff.date, note: oneOff.note || undefined }].sort((a, b) => a.date.localeCompare(b.date)));
              setOneOff({ date: '', note: '' });
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <DateList items={draft.oneOffWorkDays.map((o) => ({ id: o.id, date: o.date, label: o.note ?? 'Work day' }))} onRemove={(id) => set('oneOffWorkDays', draft.oneOffWorkDays.filter((o) => o.id !== id))} tone="violet" />
      </div>

      <div>
        <H sub="Add local show days or company shutdown days.">Additional holidays</H>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input type="date" className="input" aria-label="Holiday date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
          <input className="input" placeholder="Holiday name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
          <button
            className="btn-secondary"
            disabled={!hol.date}
            onClick={() => {
              set('customHolidays', [...draft.customHolidays.filter((h) => h.date !== hol.date), { date: hol.date, name: hol.name || 'Company holiday', region: 'Custom' as const }].sort((a, b) => a.date.localeCompare(b.date)));
              setHol({ date: '', name: '' });
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <DateList items={draft.customHolidays.map((h) => ({ id: h.date, date: h.date, label: h.name }))} onRemove={(id) => set('customHolidays', draft.customHolidays.filter((h) => h.date !== id))} tone="rose" />
        <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          <summary className="cursor-pointer font-medium">
            {draft.holidayRegion} public holidays {year}–{year + 1} ({holidays.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {holidays.map((h) => (
              <li key={h.date} className="flex justify-between gap-2">
                <span>{h.name}</span>
                <span className="num text-slate-500">{fmtDate(h.date, 'EEE d MMM yyyy')}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

function DateList({ items, onRemove, tone }: { items: { id: string; date: string; label: string }[]; onRemove: (id: string) => void; tone: 'amber' | 'violet' | 'rose' }) {
  const tones = { amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300', violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' };
  if (!items.length) return <p className="mt-2 text-xs text-slate-500">None added.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i.id} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', tones[tone])}>
          <span className="num">{fmtDate(i.date, 'd MMM yy')}</span> · {i.label}
          <button onClick={() => onRemove(i.id)} aria-label={`Remove ${i.date}`} className="ml-0.5 opacity-70 hover:opacity-100">×</button>
        </span>
      ))}
    </div>
  );
}

function VehiclesTab({ draft, set }: TabProps) {
  const [plate, setPlate] = useState({ plate: '', label: '' });
  const [tag, setTag] = useState({ tagNumber: '', plate: '', label: '' });
  const [bulk, setBulk] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');

  const importBulk = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const existing = new Set(draft.tags.map((t) => t.tagNumber));
    const added: UserSettings['tags'] = [];
    let skipped = 0;
    for (const line of lines) {
      const [rawTag, rawPlate, ...rest] = line.split(/[,;\t]/).map((s) => s.trim());
      const num = (rawTag ?? '').replace(/\D/g, '');
      if (num.length < 8 || num.length > 16) {
        skipped++;
        continue;
      }
      if (existing.has(num)) {
        skipped++;
        continue;
      }
      existing.add(num);
      added.push({ id: uid('tag'), tagNumber: num, plate: rawPlate?.toUpperCase() || undefined, label: rest.join(' ') || undefined });
    }
    set('tags', [...draft.tags, ...added]);
    setBulkMsg(`Added ${added.length} tag(s)${skipped ? `, skipped ${skipped} (duplicate, header or invalid)` : ''}.`);
    setBulk('');
  };

  return (
    <div className="space-y-6">
      <div>
        <H sub="Linkt statements often list the e-TAG transponder number instead of the plate. Tolls from unregistered tags/plates are scored lower.">Linkt tag transponder numbers</H>
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
          <input className="input num" placeholder="Tag number e.g. 21130132976" inputMode="numeric" value={tag.tagNumber} onChange={(e) => setTag({ ...tag, tagNumber: e.target.value })} />
          <input className="input uppercase" placeholder="Plate (optional)" value={tag.plate} onChange={(e) => setTag({ ...tag, plate: e.target.value })} />
          <input className="input" placeholder="Label (optional)" value={tag.label} onChange={(e) => setTag({ ...tag, label: e.target.value })} />
          <button
            className="btn-secondary"
            disabled={tag.tagNumber.replace(/\D/g, '').length < 8}
            onClick={() => {
              const num = tag.tagNumber.replace(/\D/g, '');
              if (!draft.tags.some((t) => t.tagNumber === num)) set('tags', [...draft.tags, { id: uid('tag'), tagNumber: num, plate: tag.plate.toUpperCase() || undefined, label: tag.label || undefined }]);
              setTag({ tagNumber: '', plate: '', label: '' });
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {draft.tags.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="py-1">Tag number</th><th>Mapped plate</th><th>Label</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {draft.tags.map((t) => (
                <tr key={t.id}>
                  <td className="num py-1.5">{t.tagNumber}</td>
                  <td>
                    <input className="input py-1! text-xs! uppercase" value={t.plate ?? ''} placeholder="—" onChange={(e) => set('tags', draft.tags.map((x) => (x.id === t.id ? { ...x, plate: e.target.value.toUpperCase() || undefined } : x)))} />
                  </td>
                  <td className="pl-2 text-xs text-slate-500">{t.label ?? ''}</td>
                  <td className="text-right">
                    <button className="btn-ghost p-1!" aria-label="Remove tag" onClick={() => set('tags', draft.tags.filter((x) => x.id !== t.id))}><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium">Bulk upload tags</span>
            <label className="btn-ghost btn-sm cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> From CSV / TXT
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) importBulk(await f.text());
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <textarea className="input num min-h-[70px] text-xs!" placeholder={'One per line: tag number, plate (optional), label (optional)\n21130132976, 123ABC, Work ute'} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-700 dark:text-emerald-400">{bulkMsg}</span>
            <button className="btn-secondary btn-sm" disabled={!bulk.trim()} onClick={() => importBulk(bulk)}>Import</button>
          </div>
        </div>
      </div>

      <div>
        <H sub="Registration plates of vehicles you use for work travel.">Vehicle registrations</H>
        <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
          <input className="input uppercase" placeholder="Plate e.g. 123ABC" value={plate.plate} onChange={(e) => setPlate({ ...plate, plate: e.target.value })} />
          <input className="input" placeholder="Label (optional)" value={plate.label} onChange={(e) => setPlate({ ...plate, label: e.target.value })} />
          <button
            className="btn-secondary"
            disabled={!plate.plate.trim()}
            onClick={() => {
              const p = plate.plate.toUpperCase().replace(/\s+/g, '');
              if (!draft.vehicles.some((v) => v.plate === p)) set('vehicles', [...draft.vehicles, { id: uid('veh'), plate: p, label: plate.label || undefined }]);
              setPlate({ plate: '', label: '' });
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {draft.vehicles.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">
              <Car className="h-3 w-3" /> <span className="num font-semibold">{v.plate}</span> {v.label && <span className="text-slate-500">{v.label}</span>}
              <button onClick={() => set('vehicles', draft.vehicles.filter((x) => x.id !== v.id))} aria-label={`Remove ${v.plate}`}>×</button>
            </span>
          ))}
          {!draft.vehicles.length && <span className="text-xs text-slate-500">No vehicles registered — all vehicles/tags are treated as eligible.</span>}
        </div>
      </div>
    </div>
  );
}

function PreferencesTab({ draft, set }: TabProps) {
  return (
    <div className="space-y-5">
      <Toggle
        checked={draft.autoSelectHighConfidence}
        onChange={(v) => set('autoSelectHighConfidence', v)}
        label="Auto-select high confidence tolls (95%+)"
        description="Rostered days with both a morning and evening commute are pre-selected as “Likely Office Attendance”."
      />
      <Toggle
        checked={draft.onlyHighlightClaimed}
        onChange={(v) => set('onlyHighlightClaimed', v)}
        label="Only highlight claimed tolls in the PDF viewer"
        description="Keeps unclaimed rows clean so the statement stays easy to read."
      />
      <div>
        <div className="label">Appearance</div>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} onClick={() => set('theme', t)} className={cx('rounded-lg border px-4 py-2 text-sm capitalize', draft.theme === t ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700')}>
              {t} mode
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
        <div className="mb-1 font-semibold text-slate-700 dark:text-slate-300">How confidence is scored</div>
        <ul className="space-y-0.5">
          <li><b>100%</b> — manually selected / overridden by you</li>
          <li><b>95–99%</b> — rostered day, matches both morning & evening commute windows</li>
          <li><b>80–94%</b> — rostered day, matches one commute leg (un-paired trip)</li>
          <li><b>50–79%</b> — work day at an unusual travel time</li>
          <li><b>0–49%</b> — outside roster, leave day or public holiday</li>
        </ul>
      </div>
    </div>
  );
}

function DataTab() {
  const openModal = useTollStore((s) => s.openModal);
  const statements = useTollStore((s) => s.statements);
  const txns = useTollStore((s) => s.transactions.length);
  const overrides = useTollStore((s) => Object.keys(s.overrides).length);
  return (
    <div className="space-y-4">
      <H sub="All data lives in this browser's IndexedDB. Nothing is sent to a server.">Stored data</H>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          ['Statements', statements.length],
          ['Transactions', txns],
          ['Overrides & notes', overrides],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <dd className="num text-xl font-semibold">{v}</dd>
            <dt className="text-xs text-slate-500">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => openModal('upload')}><Upload className="h-4 w-4" /> Manage statements</button>
        <button className="btn-danger" onClick={() => openModal('reset')}><Trash2 className="h-4 w-4" /> Clear data / factory reset…</button>
      </div>
    </div>
  );
}
