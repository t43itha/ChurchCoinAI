// Pure money math for statement reconciliation. All comparisons happen in
// integer pence because transaction amounts are stored as floating-point pounds.
import { roundMoney } from "../convex/lib/money";

export interface ClearedTransactionLike {
  amount: number;
  type: "Income" | "Expenditure";
}

export function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

// Money in and money out of the cleared lines, both positive, in integer pence.
export function computeClearedSplitPence(cleared: ClearedTransactionLike[]): {
  inPence: number;
  outPence: number;
} {
  let inPence = 0;
  let outPence = 0;
  for (const t of cleared) {
    if (t.type === "Income") inPence += toPence(t.amount);
    else outPence += toPence(t.amount);
  }
  return { inPence, outPence };
}

export function computeClearedTotalPence(
  cleared: ClearedTransactionLike[]
): number {
  const { inPence, outPence } = computeClearedSplitPence(cleared);
  return inPence - outPence;
}

// Unsigned amount: optional £, then digits with no grouping or with thousands
// grouping, then optional pence. Grouping that is not in threes ("1,5", "12,34") is rejected.
const UNSIGNED_BALANCE = /^£?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

// A balance typed on the statement, in pounds. Accepts "£1,250.40", "-£35", "−£35"
// (a true minus sign) and accounting negatives "(1,234.50)". Anything else is null:
// stripping commas would turn "1,5" into 15, and parseFloat would read "12abc" as 12.
export function parseBalance(text: string): number | null {
  const trimmed = text.trim();
  const accounting = /^\((.*)\)$/.exec(trimmed);
  const signed = accounting === null && /^[-\u2212]/.test(trimmed);
  const body = accounting ? accounting[1] : signed ? trimmed.slice(1) : trimmed;
  if (!UNSIGNED_BALANCE.test(body)) return null;
  const value = Number(body.replace(/^£/, "").replace(/,/g, ""));
  const negative = accounting !== null || signed;
  return roundMoney(negative && value !== 0 ? -value : value);
}

/**
 * Difference between the ledger and the statement, in integer pence.
 * Positive: cleared ledger movement exceeds the statement closing balance.
 * Negative: the statement shows movement not yet cleared in the ledger.
 * Zero: the session balances and may be completed.
 */
export function computeDifferencePence(
  statementOpeningBalance: number,
  statementClosingBalance: number,
  cleared: ClearedTransactionLike[]
): number {
  return (
    toPence(statementOpeningBalance) +
    computeClearedTotalPence(cleared) -
    toPence(statementClosingBalance)
  );
}

export function canCompleteSession(differencePence: number): boolean {
  return differencePence === 0;
}
