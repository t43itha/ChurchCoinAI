// Shared money helpers. Amounts are stored in pounds as JS numbers, so every
// value must be rounded to 2dp at the write boundary and compared with a
// half-penny tolerance to absorb floating-point drift.
export const MONEY_EPSILON = 0.005;

export const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

// True when `total` has reached `target`, tolerating float accumulation error.
export const meetsMoneyTarget = (total: number, target: number) =>
  total >= target - MONEY_EPSILON;

// Sum amounts in whole pence so totals never drift. Use for every money total:
// sumMoney(rows, (t) => t.amount) or, signed,
// sumMoney(rows, (t) => (t.type === "Income" ? t.amount : -t.amount)).
export const sumMoney = <T>(items: readonly T[], getAmount: (item: T) => number) =>
  items.reduce((pence, item) => pence + Math.round(getAmount(item) * 100), 0) / 100;
