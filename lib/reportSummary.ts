// Pure building blocks shared by the monthly and annual reports, their PDF and
// Excel exports. Money totals use sumMoney / roundMoney from convex/lib/money.
import type { CategoryGroup } from "../types";
import { roundMoney, sumMoney } from "../convex/lib/money";
import {
  filterIncomeAndExpenditure,
  hasBankEffect,
  isReportableIncomeTransaction,
  sumFundBalance,
  transfersByFund,
  type LedgerRow,
} from "./reportableTransactions";
import { completionPercent, isCategorized } from "./dashboardKpis";
import { isWithinRange, type DateRange, type MonthBucket } from "./reportPeriods";

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

// Income and expenditure of the reportable rows among `rows`.
function reportableTotals(rows: ReportTransaction[]): { income: number; expenditure: number } {
  const reportable = filterIncomeAndExpenditure(rows);
  return {
    income: sumMoney(reportable.filter(isReportableIncomeTransaction), (row) => row.amount),
    expenditure: sumMoney(
      reportable.filter((row) => row.type === "Expenditure"),
      (row) => row.amount
    ),
  };
}

// Adds a whole number of years to a yyyy-mm-dd date. 29 February becomes 28
// February in a non-leap year.
function shiftDateByYears(date: string, years: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetYear = year + years;
  const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
  const targetDay = month === 2 && day === 29 && !isLeap ? 28 : day;
  return `${String(targetYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    targetDay
  ).padStart(2, "0")}`;
}

function shiftRangeBackOneYear(range: DateRange): DateRange {
  return {
    startDate: shiftDateByYears(range.startDate, -1),
    endDate: shiftDateByYears(range.endDate, -1),
  };
}

function fundTotals(rows: FundStatementRow[]): FundStatementTotals {
  return {
    opening: sumMoney(rows, (row) => row.opening),
    income: sumMoney(rows, (row) => row.income),
    expenditure: sumMoney(rows, (row) => row.expenditure),
    transfers: sumMoney(rows, (row) => row.transfers),
    other: sumMoney(rows, (row) => row.other),
    closing: sumMoney(rows, (row) => row.closing),
  };
}

const FUND_TYPE_ORDER: Record<string, number> = {
  Unrestricted: 0,
  Designated: 1,
  Restricted: 2,
};

// Income and spending from the reportable rows in range, for the period.
export function periodTotals(rows: ReportTransaction[], range: DateRange): PeriodTotals {
  const { income, expenditure } = reportableTotals(rows.filter((row) => isWithinRange(row.date, range)));
  return { income, expenditure, net: roundMoney(income - expenditure) };
}

// Largest total first, subcategories largest first. `previous` is matched by
// mainCategory.
export function rankCategoryGroups(
  groups: CategoryGroup[],
  previous?: CategoryGroup[]
): RankedCategory[] {
  const sideTotal = sumMoney(groups, (group) => group.total);
  return [...groups]
    .sort((a, b) => b.total - a.total || a.mainCategory.localeCompare(b.mainCategory))
    .map((group) => {
      const ranked: RankedCategory = {
        ...group,
        subcategories: [...group.subcategories].sort(
          (a, b) => b.total - a.total || a.name.localeCompare(b.name)
        ),
        share: sideTotal === 0 ? 0 : group.total / sideTotal,
      };
      if (previous) {
        ranked.previous =
          previous.find((prior) => prior.mainCategory === group.mainCategory)?.total ?? 0;
      }
      return ranked;
    });
}

// Percentage change, one decimal place. null when previous is 0.
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
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
  const transfersById = new Map<string, number>(
    transfersByFund(rows.filter((row) => isWithinRange(row.date, range))).funds.map(
      (fund): [string, number] => [fund.fundId, fund.net]
    )
  );

  const statementRows: FundStatementRow[] = funds.map((fund) => {
    const fundRows = rows.filter((row) => row.fundId === fund._id);
    const opening = sumFundBalance(fundRows.filter((row) => row.date < range.startDate));
    const closing = sumFundBalance(fundRows.filter((row) => row.date <= range.endDate));
    const { income, expenditure } = reportableTotals(
      fundRows.filter((row) => isWithinRange(row.date, range))
    );
    const transfers = transfersById.get(fund._id) ?? 0;
    return {
      fundId: fund._id,
      fund: fund.name,
      type: fund.type,
      opening,
      income,
      expenditure,
      transfers,
      other: roundMoney(closing - opening - income + expenditure - transfers),
      closing,
    };
  });

  statementRows.sort((a, b) => {
    const rank = (type: string) => FUND_TYPE_ORDER[type] ?? 3;
    return rank(a.type) - rank(b.type) || a.fund.localeCompare(b.fund);
  });

  const isUnrestricted = (row: FundStatementRow) =>
    row.type === "Unrestricted" || row.type === "Designated";

  return {
    rows: statementRows,
    unrestricted: fundTotals(statementRows.filter(isUnrestricted)),
    restricted: fundTotals(statementRows.filter((row) => !isUnrestricted(row))),
    total: fundTotals(statementRows),
  };
}

// Reportable income and expenditure per bucket. priorRows, when given, fill
// priorIncome from each bucket shifted back one year.
export function buildTrend(
  rows: ReportTransaction[],
  buckets: MonthBucket[],
  throughDate: string,
  priorRows?: ReportTransaction[]
): TrendPoint[] {
  return buckets.map((bucket) => {
    const { income, expenditure } = reportableTotals(
      rows.filter((row) => isWithinRange(row.date, bucket))
    );
    const isFuture = bucket.startDate > throughDate;
    const point: TrendPoint = {
      ...bucket,
      income,
      expenditure,
      net: roundMoney(income - expenditure),
      isFuture,
      isPartial: !isFuture && throughDate < bucket.endDate,
    };
    if (priorRows) {
      const priorRange = shiftRangeBackOneYear(bucket);
      point.priorIncome = reportableTotals(
        priorRows.filter((row) => isWithinRange(row.date, priorRange))
      ).income;
    }
    return point;
  });
}

// Over rows that reach the bank (hasBankEffect) in range, the same measure the
// dashboard's month-end checks use. Percentages are whole numbers; null when
// there are no such rows.
export function buildReadiness(rows: ReportTransaction[], range: DateRange): DataReadiness {
  const bankRows = rows.filter((row) => hasBankEffect(row) && isWithinRange(row.date, range));
  const count = bankRows.length;
  return {
    transactionCount: count,
    categorisedPercent: completionPercent(
      bankRows.filter((row) => isCategorized(row.category)).length,
      count
    ),
    reconciledPercent: completionPercent(
      bankRows.filter((row) => row.isReconciled === true).length,
      count
    ),
  };
}

export function groupGivingByDonor(
  rows: Array<{ donorId?: string; donorName?: string; amount: number; isGiftAidEligible?: boolean }>
): GivingByDonor {
  type GivingRow = (typeof rows)[number];
  const named = new Map<string, { donorId?: string; donor?: string; rows: GivingRow[] }>();
  const anonymous: GivingRow[] = [];

  for (const row of rows) {
    if (!row.donorId && !row.donorName) {
      anonymous.push(row);
      continue;
    }
    const key = row.donorId ? `id:${row.donorId}` : `name:${row.donorName}`;
    let group = named.get(key);
    if (!group) {
      group = { donorId: row.donorId || undefined, rows: [] };
      named.set(key, group);
    }
    group.rows.push(row);
    // Later rows win, so a donor who changed name shows their latest name.
    if (row.donorName) group.donor = row.donorName;
  }

  const givers: GiverSummary[] = [...named.values()].map((group) => {
    const summary: GiverSummary = {
      donor: group.donor ?? "Unknown donor",
      gifts: group.rows.length,
      total: sumMoney(group.rows, (row) => row.amount),
      giftAidEligible: group.rows.some((row) => row.isGiftAidEligible === true),
    };
    if (group.donorId) summary.donorId = group.donorId;
    return summary;
  });
  givers.sort((a, b) => b.total - a.total || a.donor.localeCompare(b.donor));

  if (anonymous.length > 0) {
    givers.push({
      donor: "Anonymous",
      gifts: anonymous.length,
      total: sumMoney(anonymous, (row) => row.amount),
      giftAidEligible: false,
    });
  }

  return {
    givers,
    donorCount: named.size,
    giftCount: rows.length,
  };
}

// Unrestricted-fund balance divided by the average of the given monthly
// unrestricted expenditures, one decimal place. null when the average is 0.
export function reserveCover(
  unrestrictedBalance: number,
  monthlyExpenditures: number[]
): ReserveCover {
  const average = monthlyExpenditures.length
    ? sumMoney(monthlyExpenditures, (value) => value) / monthlyExpenditures.length
    : 0;
  return {
    months: average > 0 ? Math.round((unrestrictedBalance / average) * 10) / 10 : null,
    unrestrictedBalance,
    averageMonthlyExpenditure: roundMoney(average),
    targetMonths: RESERVE_TARGET_MONTHS,
  };
}
