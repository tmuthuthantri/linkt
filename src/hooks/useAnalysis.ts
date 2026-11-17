import { useTollStore } from '../store/useTollStore';
import { analyseTransactions, type AnalysisResult } from '../utils/tollDetectionEngine';
import { round2 } from '../utils/format';

export interface ClaimTotals {
  claimAmount: number;
  claimGst: number;
  claimCount: number;
  totalAmount: number;
  totalCount: number;
  workDays: number;
  officeDays: number;
  avgDailyCost: number;
  highestDay: { date: string; amount: number } | null;
  daysAwaitingReview: number;
  potentialMissing: { count: number; amount: number };
}

export function useAnalysis(): AnalysisResult & { totals: ClaimTotals } {
  const transactions = useTollStore((s) => s.transactions);
  const overrides = useTollStore((s) => s.overrides);
  const settings = useTollStore((s) => s.settings);

  return computeShared(transactions, overrides, settings);
}

// Module-level memo so every component shares one analysis run per state change.
let last: { t: unknown; o: unknown; s: unknown; value: AnalysisResult & { totals: ClaimTotals } } | null = null;

function computeShared(
  transactions: ReturnType<typeof useTollStore.getState>['transactions'],
  overrides: ReturnType<typeof useTollStore.getState>['overrides'],
  settings: ReturnType<typeof useTollStore.getState>['settings'],
) {
  if (last && last.t === transactions && last.o === overrides && last.s === settings) return last.value;
  const value = (() => {
    const result = analyseTransactions(transactions, overrides, settings);
    const claimed = result.transactions.filter((t) => t.status === 'included');
    const claimDays = result.days.filter((d) => d.claimedCount > 0);
    const highest = [...claimDays].sort((a, b) => b.claimedTotal - a.claimedTotal)[0];
    const missing = result.transactions.filter((t) => t.status !== 'included' && !t.manual && t.isWorkDay && t.confidence >= 80);
    const claimAmount = round2(claimed.reduce((s, t) => s + t.amount, 0));
    return {
      ...result,
      totals: {
        claimAmount,
        claimGst: round2(claimAmount / 11),
        claimCount: claimed.length,
        totalAmount: round2(result.transactions.reduce((s, t) => s + t.amount, 0)),
        totalCount: result.transactions.length,
        workDays: result.days.filter((d) => d.isWorkDay).length,
        officeDays: result.days.filter((d) => d.likelyOfficeAttendance).length,
        avgDailyCost: claimDays.length ? round2(claimAmount / claimDays.length) : 0,
        highestDay: highest ? { date: highest.date, amount: highest.claimedTotal } : null,
        daysAwaitingReview: result.days.filter((d) => d.reviewCount > 0).length,
        potentialMissing: { count: missing.length, amount: round2(missing.reduce((s, t) => s + t.amount, 0)) },
      },
    };
  })();
  last = { t: transactions, o: overrides, s: settings, value };
  return value;
}

export function getAnalysisSnapshot() {
  const s = useTollStore.getState();
  return computeShared(s.transactions, s.overrides, s.settings);
}
