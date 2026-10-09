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

// A balance typed on the statement, in pounds. Accepts "£1,250.40" and "-35".
// Anything else is null: parseFloat would read "1,250.40" as 1 and "12abc" as 12.
export function parseBalance(text: string): number | null {
  const cleaned = text.trim().replace(/[£,\s]/g, "");
  if (!/^-?(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(cleaned)) return null;
  return roundMoney(Number(cleaned));
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
