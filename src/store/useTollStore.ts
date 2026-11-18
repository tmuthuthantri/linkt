import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { clear as idbClear, del, get, set, createStore, keys } from 'idb-keyval';
import type {
  LeaveDate,
  AuditEventType,
  AuditLogEntry,
  StatementDocument,
  TollTransaction,
  TransactionOverride,
  UserSettings,
  ViewKey,
} from '../types';
import { ROSTER_PRESETS } from '../utils/tollDetectionEngine';
import { uid } from '../utils/format';

// Separate IndexedDB stores: one for app state JSON, one for raw PDF bytes.
const stateDb = createStore('linkt-toll-assistant', 'state');
const pdfDb = createStore('linkt-toll-assistant-pdfs', 'pdfs');

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name, stateDb)) ?? null,
  setItem: async (name, value) => set(name, value, stateDb),
  removeItem: async (name) => del(name, stateDb),
};

const pdfCache = new Map<string, Uint8Array>();

export async function savePdfBytes(id: string, bytes: Uint8Array) {
  pdfCache.set(id, bytes);
  await set(id, bytes, pdfDb);
}

export async function loadPdfBytes(id: string): Promise<Uint8Array | null> {
  const hit = pdfCache.get(id);
  if (hit) return hit;
  const stored = await get<Uint8Array | ArrayBuffer>(id, pdfDb);
  if (!stored) return null;
  const bytes = stored instanceof Uint8Array ? stored : new Uint8Array(stored);
  pdfCache.set(id, bytes);
  return bytes;
}

async function deletePdfBytes(id: string) {
  pdfCache.delete(id);
  await del(id, pdfDb);
}

async function clearAllPdfs() {
  pdfCache.clear();
  await idbClear(pdfDb);
}

export const DEFAULT_SETTINGS: UserSettings = {
  profile: {
    employeeName: '',
    employeeId: '',
    email: '',
    costCenter: '',
    department: '',
    company: '',
    managerName: '',
    managerEmail: '',
    managerTitle: '',
  },
  holidayRegion: 'QLD',
  rosterPatterns: ROSTER_PRESETS,
  activeRosterId: 'roster-ft',
  commute: { morningStart: '07:30', morningEnd: '08:30', eveningStart: '17:30', eveningEnd: '18:30', tripGapMinutes: 40 },
  saturday: {
    enabled: false,
    shiftStart: '09:15',
    shiftEnd: '12:15',
    morningStart: '08:30',
    morningEnd: '09:30',
    eveningStart: '12:00',
    eveningEnd: '13:00',
    rotation: 'fortnightly-even',
    customDates: [],
  },
  leaveDates: [],
  oneOffWorkDays: [],
  customHolidays: [],
  vehicles: [],
  tags: [],
  autoSelectHighConfidence: true,
  onlyHighlightClaimed: true,
  highlightStyle: 'emerald',
  theme: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
};

export interface TollState {
  hydrated: boolean;
  settings: UserSettings;
  statements: StatementDocument[];
  transactions: TollTransaction[];
  overrides: Record<string, TransactionOverride>;
  audit: AuditLogEntry[];

  // UI (not persisted)
  view: ViewKey;
  selectedTxnId: string | null;
  activeStatementId: string | null;
  modal: null | 'upload' | 'settings' | 'export' | 'audit' | 'reset';
  settingsTab: string;
  leaveImportOpen: boolean;
  setLeaveImportOpen: (open: boolean) => void;
  applyLeaveImport: (entries: LeaveDate[], opts: { clearOverrides: boolean; summary: string }) => { added: number; replaced: number; overridesCleared: number };

  setView: (v: ViewKey) => void;
  selectTxn: (id: string | null) => void;
  setActiveStatement: (id: string | null) => void;
  openModal: (m: TollState['modal'], settingsTab?: string) => void;
  closeModal: () => void;

  log: (type: AuditEventType, message: string, details?: string) => void;
  addStatement: (doc: StatementDocument, txns: TollTransaction[], bytes: Uint8Array) => Promise<void>;
  removeStatement: (id: string) => Promise<void>;
  setIncluded: (ids: string[], included: boolean | undefined, source?: string) => void;
  setNote: (id: string, note: string) => void;
  resetOverrides: () => void;
  updateSettings: (patch: Partial<UserSettings>, message?: string) => void;
  clearStatementData: () => Promise<void>;
  factoryReset: () => Promise<void>;
}

export const useTollStore = create<TollState>()(
  persist(
    (setState, getState) => ({
      hydrated: false,
      settings: DEFAULT_SETTINGS,
      statements: [],
      transactions: [],
      overrides: {},
      audit: [],

      view: 'dashboard',
      selectedTxnId: null,
      activeStatementId: null,
      modal: null,
      settingsTab: 'profile',
      leaveImportOpen: false,
      setLeaveImportOpen: (leaveImportOpen) => setState({ leaveImportOpen }),

      applyLeaveImport: (entries, { clearOverrides, summary }) => {
        const s = getState();
        const byDate = new Map(s.settings.leaveDates.map((l) => [l.date, l]));
        let added = 0;
        let replaced = 0;
        for (const e of entries) {
          if (byDate.has(e.date)) replaced++;
          else added++;
          byDate.set(e.date, e);
        }
        const dates = new Set(entries.filter((e) => !e.partial).map((e) => e.date));
        let overridesCleared = 0;
        let overrides = s.overrides;
        if (clearOverrides) {
          overrides = { ...s.overrides };
          for (const t of s.transactions) {
            const o = overrides[t.id];
            if (!dates.has(t.date) || o?.included === undefined) continue;
            overridesCleared++;
            if (o.notes) overrides[t.id] = { notes: o.notes, updatedAt: new Date().toISOString() };
            else delete overrides[t.id];
          }
        }
        setState({
          overrides,
          settings: { ...s.settings, leaveDates: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) },
        });
        getState().log(
          'leave-import',
          `Imported ${entries.length} leave day(s) from screenshot`,
          `${summary} · ${added} new, ${replaced} updated${overridesCleared ? ` · ${overridesCleared} manual claim decision(s) on leave days reset` : ''}`,
        );
        return { added, replaced, overridesCleared };
      },

      setView: (view) => setState({ view }),
      selectTxn: (selectedTxnId) => {
        if (selectedTxnId) {
          const t = getState().transactions.find((x) => x.id === selectedTxnId);
          if (t) setState({ selectedTxnId, activeStatementId: t.statementId });
          return;
        }
        setState({ selectedTxnId });
      },
      setActiveStatement: (activeStatementId) => setState({ activeStatementId }),
      openModal: (modal, settingsTab) => setState({ modal, ...(settingsTab ? { settingsTab } : {}) }),
      closeModal: () => setState({ modal: null }),

      log: (type, message, details) =>
        setState((s) => ({
          audit: [...s.audit, { id: uid('log'), timestamp: new Date().toISOString(), type, message, details }].slice(-5000),
        })),

      addStatement: async (doc, txns, bytes) => {
        await savePdfBytes(doc.id, bytes);
        setState((s) => ({
          statements: [...s.statements, doc],
          transactions: [...s.transactions, ...txns],
          activeStatementId: s.activeStatementId ?? doc.id,
        }));
        getState().log(
          'import',
          `Imported ${doc.fileName}`,
          `${doc.transactionCount} toll transactions extracted across ${doc.pageCount} page(s); ${doc.excludedLineCount} non-toll ledger lines excluded. Invoice ${doc.invoiceRef || 'n/a'}, account ${doc.accountNumber || 'n/a'}.`,
        );
      },

      removeStatement: async (id) => {
        const doc = getState().statements.find((d) => d.id === id);
        await deletePdfBytes(id);
        setState((s) => {
          const remaining = s.transactions.filter((t) => t.statementId !== id);
          const keep = new Set(remaining.map((t) => t.id));
          const overrides = Object.fromEntries(Object.entries(s.overrides).filter(([k]) => keep.has(k)));
          const statements = s.statements.filter((d) => d.id !== id);
          return {
            statements,
            transactions: remaining,
            overrides,
            activeStatementId: s.activeStatementId === id ? statements[0]?.id ?? null : s.activeStatementId,
            selectedTxnId: null,
          };
        });
        getState().log('delete', `Removed statement ${doc?.fileName ?? id}`);
      },

      setIncluded: (ids, included, source) => {
        if (!ids.length) return;
        const now = new Date().toISOString();
        setState((s) => {
          const overrides = { ...s.overrides };
          for (const id of ids) {
            const prev = overrides[id] ?? { updatedAt: now };
            if (included === undefined) {
              const { included: _drop, ...rest } = prev;
              void _drop;
              if (rest.notes) overrides[id] = { ...rest, updatedAt: now };
              else delete overrides[id];
            } else overrides[id] = { ...prev, included, updatedAt: now };
          }
          return { overrides };
        });
        const verb = included === undefined ? 'Reverted to AI decision' : included ? 'Included in claim' : 'Excluded from claim';
        if (ids.length === 1 && !source) {
          const t = getState().transactions.find((x) => x.id === ids[0]);
          getState().log('override', `${verb}: ${t ? `${t.date} ${t.time} ${t.tollPoint} ($${t.amount.toFixed(2)})` : ids[0]}`);
        } else {
          getState().log('bulk', `${source ?? 'Bulk action'} — ${verb.toLowerCase()} for ${ids.length} transaction(s)`);
        }
      },

      setNote: (id, note) => {
        const now = new Date().toISOString();
        setState((s) => ({ overrides: { ...s.overrides, [id]: { ...(s.overrides[id] ?? {}), notes: note, updatedAt: now } } }));
        const t = getState().transactions.find((x) => x.id === id);
        getState().log('note', `Note updated on ${t ? `${t.date} ${t.time} ${t.tollPoint}` : id}`, note || '(cleared)');
      },

      resetOverrides: () => {
        const n = Object.values(getState().overrides).filter((o) => o.included !== undefined).length;
        setState((s) => ({
          overrides: Object.fromEntries(
            Object.entries(s.overrides)
              .filter(([, o]) => o.notes)
              .map(([k, o]) => [k, { notes: o.notes, updatedAt: o.updatedAt }]),
          ),
        }));
        getState().log('bulk', `Reset to AI decisions — cleared ${n} manual override(s)`);
      },

      updateSettings: (patch, message) => {
        setState((s) => ({ settings: { ...s.settings, ...patch } }));
        if (message) getState().log('settings', message);
      },

      clearStatementData: async () => {
        await clearAllPdfs();
        setState({ statements: [], transactions: [], overrides: {}, selectedTxnId: null, activeStatementId: null });
        getState().log('reset', 'Cleared all statement data (settings kept)');
      },

      factoryReset: async () => {
        await clearAllPdfs();
        const all = await keys(stateDb);
        await Promise.all(all.map((k) => del(k, stateDb)));
        setState({
          settings: { ...DEFAULT_SETTINGS, theme: getState().settings.theme },
          statements: [],
          transactions: [],
          overrides: {},
          audit: [{ id: uid('log'), timestamp: new Date().toISOString(), type: 'reset', message: 'Factory reset — all data and settings wiped' }],
          selectedTxnId: null,
          activeStatementId: null,
          view: 'dashboard',
        });
      },
    }),
    {
      name: 'linkt-toll-store-v1',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        settings: s.settings,
        statements: s.statements,
        transactions: s.transactions,
        overrides: s.overrides,
        audit: s.audit,
        activeStatementId: s.activeStatementId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TollState>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings ?? {}),
            profile: { ...DEFAULT_SETTINGS.profile, ...(p.settings?.profile ?? {}) },
            commute: { ...DEFAULT_SETTINGS.commute, ...(p.settings?.commute ?? {}) },
            saturday: { ...DEFAULT_SETTINGS.saturday, ...(p.settings?.saturday ?? {}) },
          },
        };
      },
      onRehydrateStorage: () => () => {
        useTollStore.setState({ hydrated: true });
      },
    },
  ),
);
