import { CATEGORY_ALIASES, RCI_INCOME_CATEGORIES } from "../constants/rciCategories";
import { filterReportableTransactions, sumReportableSigned } from "./reportableTransactions";
// Operational KPIs (reconciled/categorised %, unreconciled spend) deliberately
// count every non-voided row, including cash banking deposits. Money totals
// below use the reportable helpers.
// eslint-disable-next-line no-restricted-imports
import { filterActiveTransactions } from "./voidedTransactions";
import { meetsMoneyTarget, roundMoney, sumMoney } from "../convex/lib/money";

export type DashboardPeriodKey = "currentMonth" | "previousMonth" | "quarter" | "ytd";

type DateRange = {
  startDate: string;
  endDate: string;
};

export type DashboardPeriod = DateRange & {
  key: DashboardPeriodKey;
  label: string;
  // The last day the figures cover: today for a period still in progress.
  throughDate: string;
};

export type DashboardFund = {
  _id: string;
  name: string;
  type: "Restricted" | "Unrestricted" | string;
  targetAmount?: number;
  deadline?: string;
};

export type DashboardDonor = {
  _id: string;
  name: string;
  type: "Individual" | "Organization" | string;
  isGiftAidActive?: boolean;
};

export type DashboardPledge = {
  _id: string;
  donorId?: string;
  donorName?: string;
  fundId: string;
  amount: number;
  frequency: string;
  startDate: string;
  endDate?: string;
  status: string;
};

export type DashboardCashCollection = {
  _id: string;
  weekEndingDate: string;
  status: string;
};

export type DashboardCashReconciliation = {
  _id: string;
  status: string;
  cashCollectionSplits?: Array<{
    cashCollectionId: string;
    cashAmount?: number;
    chequeAmount?: number;
  }>;
};

export type DashboardStatementSession = {
  fundId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

export type DashboardTransaction = {
  _id: string;
  date: string;
  amount: number;
  type: "Income" | "Expenditure";
  category?: string;
  fundId?: string;
  isReconciled?: boolean;
  donorId?: string;
  donorName?: string;
  pledgeId?: string;
  isGiftAidEligible?: boolean;
  cashCollectionId?: string;
  cashBankingRole?: "source_giving" | "bank_deposit";
  paymentMethod?: string;
  isVoided?: boolean;
};

type FundBalance = {
  fundId: string;
  name: string;
  balance: number;
};

export type ExecutiveDashboardSummary = {
  period: DashboardPeriod;
  health: {
    operatingPosition: "Healthy" | "Watch" | "Deficit";
    netMovement: number;
    givingTrendPercent: number | null;
    generalFundCoverageMonths: number | null;
  };
  readiness: {
    reconciledPercent: number | null;
    categorizedPercent: number | null;
    cashBankingPendingWeeks: number;
    unreconciledExpenditureCount: number;
    giftAidClaimable: number;
    missionTitheDue: number;
    statementsDueThrough: string;
    statementsBehind: Array<{
      fundId: string;
      name: string;
      reconciledThrough: string | null;
    }>;
  };
  funds: {
    generalFundBalance: number;
    restrictedBalance: number;
    campaigns: Array<{
      fundId: string;
      name: string;
      progressPercent: number;
      balance: number;
      targetAmount: number;
      deadline?: string;
    }>;
    overdrawnFunds: FundBalance[];
    lowBalanceFunds: FundBalance[];
  };
  donorFollowUp: {
    missedGiftAidCount: number;
    missedGiftAidValue: number;
    pledgesBehindCount: number;
  };
  trends: {
    monthlyIncomeExpenditure: Array<{
      month: string;
      income: number;
      expenditure: number;
      net: number;
    }>;
  };
};

export type BuildExecutiveDashboardSummaryInput = {
  periodKey?: DashboardPeriodKey;
  now?: Date;
  funds: DashboardFund[];
  transactions: DashboardTransaction[];
  donors: DashboardDonor[];
  pledges: DashboardPledge[];
  cashCollections: DashboardCashCollection[];
  cashReconciliations: DashboardCashReconciliation[];
  statementSessions: DashboardStatementSession[];
  bankAccountFundIds: string[];
};

const GIVING_CATEGORIES = new Set(RCI_INCOME_CATEGORIES["Donations"] ?? []);
const UNCATEGORIZED = "Uncategorized";
const LOW_BALANCE_THRESHOLD = 1000;
const MAX_CAMPAIGNS = 3;

// Days a pledge can go without a payment before it counts as behind. One-off
// pledges have no cadence, so they never fall behind.
const PLEDGE_LAPSE_DAYS: Partial<Record<string, number>> = {
  Weekly: 14,
  Monthly: 45,
  Annual: 395,
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function getDashboardPeriod(
  periodKey: DashboardPeriodKey = "previousMonth",
  now = new Date()
): DashboardPeriod {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = formatDate(now);

  if (periodKey === "currentMonth") {
    return buildPeriod(periodKey, today, new Date(Date.UTC(year, month, 1)), endOfMonth(year, month));
  }

  if (periodKey === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return buildPeriod(
      periodKey,
      today,
      new Date(Date.UTC(year, quarterStartMonth, 1)),
      endOfMonth(year, quarterStartMonth + 2),
      `Q${Math.floor(month / 3) + 1} ${year}`
    );
  }

  if (periodKey === "ytd") {
    return buildPeriod(
      periodKey,
      today,
      new Date(Date.UTC(year, 0, 1)),
      new Date(Date.UTC(year, month, now.getUTCDate())),
      `${year} YTD`
    );
  }

  const previousMonth = new Date(Date.UTC(year, month - 1, 1));
  return buildPeriod(
    periodKey,
    today,
    previousMonth,
    endOfMonth(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth())
  );
}

export function buildExecutiveDashboardSummary({
  periodKey = "previousMonth",
  now = new Date(),
  funds,
  transactions,
  donors,
  pledges,
  cashCollections,
  cashReconciliations,
  statementSessions,
  bankAccountFundIds,
}: BuildExecutiveDashboardSummaryInput): ExecutiveDashboardSummary {
  const period = getDashboardPeriod(periodKey, now);
  const elapsed = { startDate: period.startDate, endDate: period.throughDate };
  const activeTransactions = filterActiveTransactions(transactions);
  const reportableTransactions = filterReportableTransactions(transactions);
  const periodTransactions = activeTransactions.filter((transaction) =>
    isWithinRange(transaction.date, elapsed)
  );
  const reportablePeriodTransactions = reportableTransactions.filter((transaction) =>
    isWithinRange(transaction.date, elapsed)
  );
  const unrestrictedFundIds = new Set(
    funds.filter((fund) => fund.type === "Unrestricted").map((fund) => fund._id)
  );
  const unrestrictedPeriodTransactions = reportablePeriodTransactions.filter((transaction) =>
    isUnrestrictedTransaction(transaction, unrestrictedFundIds)
  );

  const periodIncome = sumByType(unrestrictedPeriodTransactions, "Income");
  const periodExpenditure = sumByType(unrestrictedPeriodTransactions, "Expenditure");
  const netMovement = roundMoney(periodIncome - periodExpenditure);
  const reconciledPercent = completionPercent(
    periodTransactions.filter((transaction) => transaction.isReconciled === true).length,
    periodTransactions.length
  );
  const categorizedPercent = completionPercent(
    periodTransactions.filter((transaction) => isCategorized(transaction.category)).length,
    periodTransactions.length
  );
  const giftAidClaimable = roundMoney(
    sumAmounts(
      reportablePeriodTransactions.filter(
        (transaction) => transaction.type === "Income" && transaction.isGiftAidEligible === true
      )
    ) * 0.25
  );
  const missionTitheDue = roundMoney(
    sumAmounts(
      unrestrictedPeriodTransactions.filter(
        (transaction) => transaction.type === "Income" && isGivingCategory(transaction.category)
      )
    ) * 0.1
  );
  const cashBankingPendingWeeks = countCashBankingPendingWeeks(
    elapsed,
    periodTransactions,
    cashCollections,
    cashReconciliations
  );
  const unreconciledExpenditureCount = periodTransactions.filter(
    (transaction) => transaction.type === "Expenditure" && transaction.isReconciled !== true
  ).length;
  const trends = buildSixMonthTrend(period, reportableTransactions, unrestrictedFundIds);
  const generalFundBalance = roundMoney(
    sumReportableSigned(
      reportableTransactions.filter((transaction) =>
        isUnrestrictedTransaction(transaction, unrestrictedFundIds)
      )
    )
  );
  const averageMonthlyUnrestrictedExpenditure = average(
    trends.monthlyIncomeExpenditure
      .filter((month) => isCompleteMonth(month.month, period.throughDate))
      .map((month) => month.expenditure)
  );
  const generalFundCoverageMonths =
    averageMonthlyUnrestrictedExpenditure > 0
      ? roundToOneDecimal(generalFundBalance / averageMonthlyUnrestrictedExpenditure)
      : null;
  const fundBalances = buildFundBalances(funds, reportableTransactions);
  const statementsDueThrough = formatDate(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  );

  return {
    period,
    health: {
      operatingPosition: netMovement >= 0 ? "Healthy" : periodIncome >= periodExpenditure * 0.9 ? "Watch" : "Deficit",
      netMovement,
      givingTrendPercent: calculateGivingTrendPercent(period, reportableTransactions, unrestrictedFundIds),
      generalFundCoverageMonths,
    },
    readiness: {
      reconciledPercent,
      categorizedPercent,
      cashBankingPendingWeeks,
      unreconciledExpenditureCount,
      giftAidClaimable,
      missionTitheDue,
      statementsDueThrough,
      statementsBehind: buildStatementsBehind(
        funds,
        statementSessions,
        bankAccountFundIds,
        statementsDueThrough
      ),
    },
    funds: {
      generalFundBalance,
      restrictedBalance: sumMoney(
        fundBalances.filter(({ fund }) => fund.type !== "Unrestricted"),
        ({ balance }) => balance
      ),
      campaigns: buildCampaigns(period, fundBalances),
      overdrawnFunds: fundBalances
        .filter(({ balance }) => balance < 0)
        .map(toFundBalance),
      lowBalanceFunds: fundBalances
        .filter(({ fund, balance }) => !fund.targetAmount && balance >= 0 && balance < LOW_BALANCE_THRESHOLD)
        .map(toFundBalance),
    },
    donorFollowUp: buildDonorFollowUp(
      period,
      reportableTransactions,
      reportablePeriodTransactions,
      donors,
      pledges
    ),
    trends,
  };
}

function buildPeriod(
  key: DashboardPeriodKey,
  today: string,
  start: Date,
  end: Date,
  label = MONTH_FORMATTER.format(start)
): DashboardPeriod {
  const endDate = formatDate(end);

  return {
    key,
    label,
    startDate: formatDate(start),
    endDate,
    throughDate: today < endDate ? today : endDate,
  };
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0));
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function addDays(date: string, days: number) {
  const parsed = parseDate(date);
  return formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + days)));
}

function isWithinRange(date: string, range: DateRange) {
  return date >= range.startDate && date <= range.endDate;
}

function isCompleteMonth(monthKey: string, throughDate: string) {
  const through = parseDate(throughDate);
  return (
    monthKey < throughDate.slice(0, 7) ||
    formatDate(endOfMonth(through.getUTCFullYear(), through.getUTCMonth())) === throughDate
  );
}

// Fractional calendar months between two dates, so a partial month counts by
// the share of its days elapsed.
function monthsCovered(range: DateRange) {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  let months = 0;

  for (
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    cursor <= end;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    const monthEnd = endOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth());
    const from = cursor < start ? start : cursor;
    const to = monthEnd > end ? end : monthEnd;
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    months += days / monthEnd.getUTCDate();
  }

  return months;
}

function sumAmounts(transactions: DashboardTransaction[]) {
  return sumMoney(transactions, (transaction) => transaction.amount);
}

function sumByType(transactions: DashboardTransaction[], type: DashboardTransaction["type"]) {
  return sumAmounts(transactions.filter((transaction) => transaction.type === type));
}

function completionPercent(numerator: number, denominator: number) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 100);
}

function roundToOneDecimal(amount: number) {
  return Math.round(amount * 10) / 10;
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isCategorized(category?: string) {
  return Boolean(category) && category !== UNCATEGORIZED;
}

function isUnrestrictedTransaction(transaction: DashboardTransaction, unrestrictedFundIds: Set<string>) {
  return transaction.fundId ? unrestrictedFundIds.has(transaction.fundId) : false;
}

function isGivingCategory(category?: string) {
  return GIVING_CATEGORIES.has(category ? CATEGORY_ALIASES[category] ?? category : "");
}

function isCashOrCheque(transaction: DashboardTransaction) {
  return transaction.paymentMethod === "Cash" || transaction.paymentMethod === "Cheque";
}

function countCashBankingPendingWeeks(
  period: DateRange,
  transactions: DashboardTransaction[],
  cashCollections: DashboardCashCollection[],
  cashReconciliations: DashboardCashReconciliation[]
) {
  const completedSplits = cashReconciliations
    .filter((reconciliation) => reconciliation.status === "completed")
    .flatMap((reconciliation) => reconciliation.cashCollectionSplits ?? []);

  return cashCollections.filter((collection) => {
    if (!isWithinRange(collection.weekEndingDate, period)) {
      return false;
    }

    if (collection.status !== "submitted" && collection.status !== "banked") {
      return false;
    }

    const expectedTotal = sumAmounts(
      transactions.filter(
        (transaction) =>
          transaction.type === "Income" &&
          transaction.cashCollectionId === collection._id &&
          isCashOrCheque(transaction)
      )
    );

    if (expectedTotal <= 0) {
      return false;
    }

    const coveredTotal = sumMoney(
      completedSplits.filter((split) => split.cashCollectionId === collection._id),
      (split) => (split.cashAmount ?? 0) + (split.chequeAmount ?? 0)
    );

    return !meetsMoneyTarget(coveredTotal, expectedTotal);
  }).length;
}

function buildSixMonthTrend(
  selectedPeriod: DashboardPeriod,
  transactions: DashboardTransaction[],
  unrestrictedFundIds: Set<string>
) {
  const trendEnd = parseDate(selectedPeriod.endDate);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(trendEnd.getUTCFullYear(), trendEnd.getUTCMonth() - (5 - index), 1));
    const monthEnd = formatDate(endOfMonth(date.getUTCFullYear(), date.getUTCMonth()));
    const range = {
      startDate: formatDate(date),
      endDate: monthEnd < selectedPeriod.throughDate ? monthEnd : selectedPeriod.throughDate,
    };
    const monthTransactions = transactions.filter(
      (transaction) =>
        isWithinRange(transaction.date, range) &&
        isUnrestrictedTransaction(transaction, unrestrictedFundIds)
    );
    const income = sumByType(monthTransactions, "Income");
    const expenditure = sumByType(monthTransactions, "Expenditure");

    return {
      month: formatMonthKey(date),
      income,
      expenditure,
      net: roundMoney(income - expenditure),
    };
  });

  return { monthlyIncomeExpenditure: months };
}

// Monthly unrestricted giving so far in the period against the average of the
// three full months before it.
function calculateGivingTrendPercent(
  period: DashboardPeriod,
  transactions: DashboardTransaction[],
  unrestrictedFundIds: Set<string>
) {
  const givingIn = (range: DateRange) =>
    sumAmounts(
      transactions.filter(
        (transaction) =>
          transaction.type === "Income" &&
          isWithinRange(transaction.date, range) &&
          isUnrestrictedTransaction(transaction, unrestrictedFundIds) &&
          isGivingCategory(transaction.category)
      )
    );
  const start = parseDate(period.startDate);
  const baselineMonthly =
    givingIn({
      startDate: formatDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1))),
      endDate: formatDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0))),
    }) / 3;

  if (baselineMonthly <= 0) {
    return null;
  }

  const elapsed = { startDate: period.startDate, endDate: period.throughDate };
  const currentMonthly = givingIn(elapsed) / monthsCovered(elapsed);

  return Math.round(((currentMonthly - baselineMonthly) / baselineMonthly) * 100);
}

function buildDonorFollowUp(
  period: DashboardPeriod,
  transactions: DashboardTransaction[],
  periodTransactions: DashboardTransaction[],
  donors: DashboardDonor[],
  pledges: DashboardPledge[]
): ExecutiveDashboardSummary["donorFollowUp"] {
  const declaredDonorIds = new Set(
    donors
      .filter((donor) => donor.type === "Individual" && donor.isGiftAidActive === true)
      .map((donor) => donor._id)
  );
  const missedGiftAid = periodTransactions.filter(
    (transaction) =>
      transaction.type === "Income" &&
      transaction.donorId !== undefined &&
      declaredDonorIds.has(transaction.donorId) &&
      isGivingCategory(transaction.category) &&
      transaction.isGiftAidEligible !== true
  );
  const pledgesBehind = pledges.filter((pledge) => {
    const lapseDays = PLEDGE_LAPSE_DAYS[pledge.frequency];

    if (pledge.status !== "Active" || lapseDays === undefined) {
      return false;
    }

    const windowStart = addDays(period.throughDate, -lapseDays);

    if (pledge.startDate > windowStart || (pledge.endDate && pledge.endDate < windowStart)) {
      return false;
    }

    const window = { startDate: windowStart, endDate: period.throughDate };
    return !transactions.some(
      (transaction) =>
        isWithinRange(transaction.date, window) && isPledgeSatisfiedByTransaction(pledge, transaction)
    );
  });

  return {
    missedGiftAidCount: missedGiftAid.length,
    missedGiftAidValue: roundMoney(sumAmounts(missedGiftAid) * 0.25),
    pledgesBehindCount: pledgesBehind.length,
  };
}

function isPledgeSatisfiedByTransaction(
  pledge: DashboardPledge,
  transaction: DashboardTransaction
) {
  if (transaction.type !== "Income") {
    return false;
  }

  if (transaction.pledgeId) {
    return transaction.pledgeId === pledge._id;
  }

  if (transaction.donorId && pledge.donorId && transaction.donorId === pledge.donorId) {
    return true;
  }

  return Boolean(
    transaction.donorName &&
      pledge.donorName &&
      transaction.donorName === pledge.donorName
  );
}

function buildFundBalances(funds: DashboardFund[], transactions: DashboardTransaction[]) {
  const transactionsByFund = new Map<string, DashboardTransaction[]>();

  transactions.forEach((transaction) => {
    if (transaction.fundId) {
      const fundTransactions = transactionsByFund.get(transaction.fundId);
      if (fundTransactions) {
        fundTransactions.push(transaction);
      } else {
        transactionsByFund.set(transaction.fundId, [transaction]);
      }
    }
  });

  return funds.map((fund) => ({
    fund,
    balance: roundMoney(sumReportableSigned(transactionsByFund.get(fund._id) ?? [])),
  }));
}

function toFundBalance({ fund, balance }: { fund: DashboardFund; balance: number }): FundBalance {
  return { fundId: fund._id, name: fund.name, balance };
}

function buildCampaigns(
  period: DashboardPeriod,
  fundBalances: Array<{ fund: DashboardFund; balance: number }>
): ExecutiveDashboardSummary["funds"]["campaigns"] {
  return fundBalances
    .flatMap(({ fund, balance }) =>
      fund.targetAmount && fund.targetAmount > 0
        ? [{ fund, balance, targetAmount: fund.targetAmount }]
        : []
    )
    .filter(
      ({ fund, balance, targetAmount }) =>
        !(fund.deadline && fund.deadline < period.throughDate) &&
        !meetsMoneyTarget(balance, targetAmount)
    )
    .sort((a, b) => (a.fund.deadline ?? "￿").localeCompare(b.fund.deadline ?? "￿"))
    .slice(0, MAX_CAMPAIGNS)
    .map(({ fund, balance, targetAmount }) => ({
      fundId: fund._id,
      name: fund.name,
      progressPercent: Math.round((balance / targetAmount) * 100),
      balance,
      targetAmount,
      deadline: fund.deadline,
    }));
}

function buildStatementsBehind(
  funds: DashboardFund[],
  statementSessions: DashboardStatementSession[],
  bankAccountFundIds: string[],
  dueThrough: string
) {
  const completedByFund = new Map<string, DashboardStatementSession[]>();

  statementSessions
    .filter((session) => session.status === "completed")
    .forEach((session) => {
      const sessions = completedByFund.get(session.fundId);
      if (sessions) {
        sessions.push(session);
      } else {
        completedByFund.set(session.fundId, [session]);
      }
    });

  const accountFundIds = new Set([...bankAccountFundIds, ...completedByFund.keys()]);

  return funds
    .filter((fund) => accountFundIds.has(fund._id))
    .map((fund) => ({
      fundId: fund._id,
      name: fund.name,
      reconciledThrough: contiguousReconciledThrough(completedByFund.get(fund._id) ?? []),
    }))
    .filter((fund) => fund.reconciledThrough === null || fund.reconciledThrough < dueThrough);
}

// End of the unbroken run of completed statements from the first one. A
// reopened or missing month ends the run, so a later completion cannot hide it.
function contiguousReconciledThrough(completed: DashboardStatementSession[]) {
  const sorted = [...completed].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  let reconciledThrough: string | null = null;

  for (const session of sorted) {
    if (reconciledThrough !== null && session.periodStart > addDays(reconciledThrough, 1)) {
      break;
    }
    if (reconciledThrough === null || session.periodEnd > reconciledThrough) {
      reconciledThrough = session.periodEnd;
    }
  }

  return reconciledThrough;
}
