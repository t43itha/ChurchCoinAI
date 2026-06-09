// Pure money math for statement reconciliation. All comparisons happen in
// integer pence because transaction amounts are stored as floating-point pounds.

export interface ClearedTransactionLike {
  amount: number;
  type: "Income" | "Expenditure";
}

export function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function computeClearedTotalPence(
  cleared: ClearedTransactionLike[]
): number {
  return cleared.reduce(
    (sum, t) => sum + (t.type === "Income" ? toPence(t.amount) : -toPence(t.amount)),
    0
  );
}

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
