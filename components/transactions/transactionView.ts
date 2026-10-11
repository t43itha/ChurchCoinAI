import { roundMoney, sumMoney } from "../../convex/lib/money";
import {
  filterFundBalanceRows,
  isUnlinkedMovementLeg,
  isVoidedTransaction,
  sumFundBalance,
} from "../../lib/reportableTransactions";
import type { Transaction } from "../../types";
import { gbp } from "../cashEntry/format";

// Segment labels double as values, since the Segmented kit shows its options as text.
export const HUB_VIEWS = ["Everything", "Giving", "Banking", "Needs you"] as const;
export type HubView = (typeof HUB_VIEWS)[number];

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "voided", label: "Voided" },
  { value: "reconciled", label: "Reconciled" },
  { value: "unreconciled", label: "Pending" },
  { value: "unlinked", label: "Unlinked income" },
  { value: "awaiting-link", label: "Waiting for other side" },
  { value: "needs-reclassifying", label: "Needs reclassifying" },
] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]["value"];
export const parseStatusFilter = (value: string | null): StatusFilter =>
  STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.value ?? "all";

export interface TransactionFilters {
  search: string;
  month: number | null;
  year: number | null;
  category: string;
  fundId: string;
  status: StatusFilter;
}

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
  retiredCategoryNames: Set<string>
): Transaction[] {
  const term = filters.search.trim().toLowerCase();
  return transactions
    .filter((t) => {
      if (term) {
        const matches =
          t.description.toLowerCase().includes(term) ||
          t.category.toLowerCase().includes(term) ||
          Boolean(t.donorName?.toLowerCase().includes(term)) ||
          t.amount.toString().includes(term);
        if (!matches) return false;
      }

      if (filters.month !== null || filters.year !== null) {
        const txDate = new Date(t.date);
        if (filters.year !== null && txDate.getFullYear() !== filters.year) return false;
        if (filters.month !== null && txDate.getMonth() !== filters.month) return false;
      }

      if (filters.category && t.category !== filters.category) return false;
      if (filters.fundId && t.fundId !== filters.fundId) return false;

      switch (filters.status) {
        case "all":
          return true;
        case "active":
          return !isVoidedTransaction(t);
        case "voided":
          return isVoidedTransaction(t);
        case "reconciled":
          return t.isReconciled;
        case "unreconciled":
          return !t.isReconciled;
        case "unlinked":
          return isUnlinkedIncome(t);
        case "awaiting-link":
          return isUnlinkedMovementLeg(t);
        case "needs-reclassifying":
          return !isVoidedTransaction(t) && retiredCategoryNames.has(t.category);
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Income with no pledge, for manual linking. Shared by the "Unlinked income" status
// filter and the "Needs you" view.
const isUnlinkedIncome = (transaction: Transaction) => transaction.type === "Income" && !transaction.pledgeId;

// The "Needs you" view: live rows that are uncategorised, unlinked income, waiting for
// their other side, or sitting in a retired category.
// Lines someone has to act on. Income without a pledge stays under the "Unlinked income" filter
// rather than here: most giving has no pledge, so it would bury the lines that need a decision.
export function needsYou(transaction: Transaction, retiredCategoryNames: Set<string>): boolean {
  if (isVoidedTransaction(transaction)) return false;
  return (
    !transaction.category ||
    retiredCategoryNames.has(transaction.category) ||
    isUnlinkedMovementLeg(transaction)
  );
}

export interface DayGroup {
  date: string;
  rows: Transaction[];
  net: number;
}

// Rows keep the order they arrive in, so callers sort first.
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const rows = groups.get(transaction.date);
    if (rows) rows.push(transaction);
    else groups.set(transaction.date, [transaction]);
  }
  return [...groups].map(([date, rows]) => ({ date, rows, net: sumFundBalance(rows) }));
}

// Money in, money out and net for a set of rows. Voided rows, and cash banking
// deposits that would count the same money twice, are left out.
export function periodTotals(rows: Transaction[]) {
  const fundRows = filterFundBalanceRows(rows);
  const moneyIn = sumMoney(
    fundRows.filter((t) => t.type === "Income"),
    (t) => t.amount
  );
  const moneyOut = sumMoney(
    fundRows.filter((t) => t.type === "Expenditure"),
    (t) => t.amount
  );
  return { moneyIn, moneyOut, net: roundMoney(sumFundBalance(rows)) };
}

// Signed for the list: income is "+", spending is a minus sign.
export function formatSignedAmount(transaction: Pick<Transaction, "type" | "amount">): string {
  return `${transaction.type === "Income" ? "+" : "−"}${gbp(Math.abs(transaction.amount))}`;
}

export function formatSignedNet(value: number): string {
  return `${value < 0 ? "−" : "+"}${gbp(Math.abs(value))}`;
}

// Checked before any save, whichever button submitted the edit form. The native
// `required` rules catch empty fields, but not whitespace or a cleared amount.
export function editDraftProblem(draft: Pick<Transaction, "date" | "description" | "amount">): string | null {
  if (!draft.description.trim()) return "Add a description before saving.";
  if (!draft.date) return "Add a date before saving.";
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) return "Enter an amount greater than 0.";
  return null;
}

// Where the panel goes once a save finishes. A save can finish after another row was opened,
// and that row's draft must survive, so only the row that was saved is moved on from.
export function editingAfterSave(current: string | null, savedId: string, nextId: string | null): string | null {
  return current === savedId ? nextId : current;
}

// Convex wraps server errors in its own prefix; show the message the server wrote.
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = /Uncaught (?:Convex)?Error: ([^\n]+)/.exec(error.message);
  return (match?.[1] ?? error.message).trim() || fallback;
}
