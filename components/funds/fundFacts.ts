import { sumMoney } from "../../convex/lib/money";
import { FundType, TransactionType, type Fund } from "../../types";

// Plain-words names for each restriction type. The fund tags keep the formal names.
export const PLAIN_TYPE_NAME: Record<FundType, string> = {
  [FundType.UNRESTRICTED]: "Free to spend",
  [FundType.DESIGNATED]: "Set aside by trustees",
  [FundType.RESTRICTED]: "Restricted by givers",
  [FundType.ENDOWMENT]: "Endowment",
};

export const TYPE_COLOUR: Record<FundType, string> = {
  [FundType.UNRESTRICTED]: "#a9cfa9",
  [FundType.DESIGNATED]: "#d9b98f",
  [FundType.RESTRICTED]: "#8f877e",
  [FundType.ENDOWMENT]: "#a08e7d",
};

const TYPE_ORDER: FundType[] = [FundType.UNRESTRICTED, FundType.DESIGNATED, FundType.RESTRICTED, FundType.ENDOWMENT];

// Pence-accurate pounds for balances and movements, with a real minus sign.
const poundsFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const formatPounds = (amount: number) =>
  `${amount < 0 ? "−" : ""}${poundsFormatter.format(Math.abs(amount))}`;

export interface FundRow {
  fundId: string;
  date: string;
  type: string;
  amount: number;
}

const signedAmount = (row: FundRow) => (row.type === TransactionType.INCOME ? row.amount : -row.amount);

const sumByFund = <T extends { fundId: string }>(rows: T[], amount: (row: T) => number): Record<string, number> => {
  const fundIds = new Set(rows.map((row) => row.fundId));
  return Object.fromEntries(
    [...fundIds].map((fundId) => [fundId, sumMoney(rows.filter((row) => row.fundId === fundId), amount)])
  );
};

// Balances by restriction type, only for types that have at least one fund.
export function balanceSplit(funds: Fund[]): { type: FundType; amount: number }[] {
  return TYPE_ORDER.flatMap((type) => {
    const ofType = funds.filter((fund) => fund.type === type);
    return ofType.length > 0 ? [{ type, amount: sumMoney(ofType, (fund) => fund.balance) }] : [];
  });
}

// Net fund movement in one calendar month (YYYY-MM), by fund id.
export function monthMovementByFund(rows: FundRow[], month: string): Record<string, number> {
  return sumByFund(
    rows.filter((row) => row.date.slice(0, 7) === month),
    signedAmount
  );
}

// Spending in one calendar month (YYYY-MM), by fund id.
export function monthSpendByFund(rows: FundRow[], month: string): Record<string, number> {
  return sumByFund(
    rows.filter((row) => row.type === TransactionType.EXPENDITURE && row.date.slice(0, 7) === month),
    (row) => row.amount
  );
}

const monthIndex = (month: string) => {
  const [year, monthOfYear] = month.split("-").map(Number);
  return year * 12 + (monthOfYear - 1);
};

// Average monthly spend from the first spending month up to the last complete month,
// counting quiet months as zero. Null until a complete month has passed.
export function averageMonthlySpend(expenditure: FundRow[], today: string): number | null {
  const currentMonth = today.slice(0, 7);
  const completeMonths = expenditure.map((row) => row.date.slice(0, 7)).filter((month) => month < currentMonth);
  if (completeMonths.length === 0) return null;

  const firstMonth = completeMonths.reduce((earliest, month) => (month < earliest ? month : earliest));
  const spent = sumMoney(
    expenditure.filter((row) => row.date.slice(0, 7) >= firstMonth && row.date.slice(0, 7) < currentMonth),
    (row) => row.amount
  );
  return spent / (monthIndex(currentMonth) - monthIndex(firstMonth));
}

// How many months of spending the balance would cover. Null when there is nothing to cover.
export function monthsCovered(balance: number, averageSpend: number | null): number | null {
  if (averageSpend === null || averageSpend <= 0 || balance <= 0) return null;
  return Math.round((balance / averageSpend) * 10) / 10;
}

// Share of a fund's target raised so far, capped at 100.
export function targetPercent(balance: number, target: number): number {
  return Math.min((balance / target) * 100, 100);
}
