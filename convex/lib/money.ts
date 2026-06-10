// Shared money helpers. Amounts are stored in pounds as JS numbers, so every
// value must be rounded to 2dp at the write boundary and compared with a
// half-penny tolerance to absorb floating-point drift.
export const MONEY_EPSILON = 0.005;

export const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

// True when `total` has reached `target`, tolerating float accumulation error.
export const meetsMoneyTarget = (total: number, target: number) =>
  total >= target - MONEY_EPSILON;
