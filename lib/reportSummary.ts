// Pure building blocks shared by the monthly and annual reports, their PDF and
// Excel exports. Money totals use sumMoney / roundMoney from convex/lib/money.
import type { CategoryGroup } from "../types";
import type { LedgerRow } from "./reportableTransactions";
import type { DateRange, MonthBucket } from "./reportPeriods";

export type ReportTransaction = LedgerRow & {
  date: string;
  category: string;
  fundId: string;
  donorId?: string;
  donorName?: string;
  isGiftAidEligible?: boolean;
  isReconciled?: boolean;
};

export type ReportFund = {
  _id: string;
  name: string;
  type: string; // "Unrestricted" | "Restricted" | "Designated"
};

export type PeriodTotals = {
  income: number;
  expenditure: number;
  net: number;
};

export type RankedCategory = CategoryGroup & {
  // Share of its side's total, 0..1. 0 when the side total is 0.
  share: number;
  // The same main category's total in the comparison period. Undefined when no
  // comparison was supplied; 0 when supplied but the category is absent there.
  previous?: number;
};

export type FundStatementRow = {
  fundId: string;
  fund: string;
  type: string;
  opening: number;
  income: number;
  expenditure: number;
  // Net of the transfers line (ledgerEffect activity "transfer") for the fund.
  transfers: number;
  // Everything else that moved the fund balance: loans, returned payments.
  other: number;
  closing: number;
};

export type FundStatementTotals = Omit<FundStatementRow, "fundId" | "fund" | "type">;

export type FundStatement = {
  // Unrestricted first, then Designated, then Restricted, then anything else;
  // by name within a type.
  rows: FundStatementRow[];
  // Unrestricted + Designated funds.
  unrestricted: FundStatementTotals;
  restricted: FundStatementTotals;
  total: FundStatementTotals;
};

export type TrendPoint = MonthBucket & {
  income: number;
  expenditure: number;
  net: number;
  // The bucket starts after throughDate.
  isFuture: boolean;
  // throughDate falls inside the bucket but before its last day.
  isPartial: boolean;
  // Income in the same bucket one year earlier, when prior rows were supplied.
  priorIncome?: number;
};

export type DataReadiness = {
  transactionCount: number;
  categorisedPercent: number | null;
  reconciledPercent: number | null;
};

export type GiverSummary = {
  donorId?: string;
  donor: string;
  gifts: number;
  total: number;
  giftAidEligible: boolean;
};

export type GivingByDonor = {
  // Largest total first. Rows with no donor fold into one "Anonymous" row, last.
  givers: GiverSummary[];
  // Distinct named givers, keyed by donorId, falling back to donorName.
  donorCount: number;
  giftCount: number;
};

export type ReserveCover = {
  months: number | null;
  unrestrictedBalance: number;
  averageMonthlyExpenditure: number;
  targetMonths: number;
};

export const RESERVE_TARGET_MONTHS = 3;

// Income and expenditure of reportable rows (filterIncomeAndExpenditure) in range.
export function periodTotals(rows: ReportTransaction[], range: DateRange): PeriodTotals {
  throw new Error("not implemented");
}

// Largest total first, subcategories largest first. `previous` is matched by
// mainCategory.
export function rankCategoryGroups(
  groups: CategoryGroup[],
  previous?: CategoryGroup[]
): RankedCategory[] {
  throw new Error("not implemented");
}

// Percentage change, one decimal place. null when previous is 0.
export function percentChange(current: number, previous: number): number | null {
  throw new Error("not implemented");
}

// opening = fund balance (sumFundBalance) of rows dated before range.startDate;
// closing = of rows on or before range.endDate. income / expenditure are the
// fund's reportable rows in range; transfers is transfersByFund net in range;
// other = closing - opening - income + expenditure - transfers. Every fund in
// `funds` gets a row, even with no activity.
export function buildFundStatement(
  funds: ReportFund[],
  rows: ReportTransaction[],
  range: DateRange
): FundStatement {
  throw new Error("not implemented");
}

// Reportable income and expenditure per bucket. priorRows, when given, fill
// priorIncome from each bucket shifted back one year.
export function buildTrend(
  rows: ReportTransaction[],
  buckets: MonthBucket[],
  throughDate: string,
  priorRows?: ReportTransaction[]
): TrendPoint[] {
  throw new Error("not implemented");
}

// Over rows that reach the bank (hasBankEffect) in range, the same measure the
// dashboard's month-end checks use. Percentages are whole numbers; null when
// there are no such rows.
export function buildReadiness(rows: ReportTransaction[], range: DateRange): DataReadiness {
  throw new Error("not implemented");
}

export function groupGivingByDonor(
  rows: Array<{ donorId?: string; donorName?: string; amount: number; isGiftAidEligible?: boolean }>
): GivingByDonor {
  throw new Error("not implemented");
}

// Unrestricted-fund balance divided by the average of the given monthly
// unrestricted expenditures, one decimal place. null when the average is 0.
export function reserveCover(
  unrestrictedBalance: number,
  monthlyExpenditures: number[]
): ReserveCover {
  throw new Error("not implemented");
}
