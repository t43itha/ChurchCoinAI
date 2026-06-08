import { CATEGORY_ALIASES, RCI_INCOME_CATEGORIES } from "../constants/rciCategories";
import { filterReportableTransactions } from "./reportableTransactions";
import { filterActiveTransactions, sumActiveSigned } from "./voidedTransactions";

export type DashboardPeriodKey = "currentMonth" | "previousMonth" | "quarter" | "ytd";

export type DashboardPeriod = {
  key: DashboardPeriodKey;
  label: string;
  startDate: string;
  endDate: string;
};

export type DashboardFund = {
  _id: string;
  name: string;
  type: "Restricted" | "Unrestricted" | string;
  targetAmount?: number;
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

export type ExecutiveDashboardSummary = {
  period: DashboardPeriod;
  health: {
    operatingPosition: "Healthy" | "Watch" | "Deficit";
    netMovement: number;
    givingTrendPercent: number;
    generalFundCoverageMonths: number | null;
    donorAttentionCount: number;
  };
  readiness: {
    reconciledPercent: number;
    categorizedPercent: number;
    cashBankingPendingWeeks: number;
    giftAidClaimable: number;
    missionTitheDue: number;
    evidenceCheckCount: number;
  };
  funds: {
    generalFundBalance: number;
    campaignProgress?: {
      fundId: string;
      name: string;
      progressPercent: number;
      balance: number;
      targetAmount: number;
    };
    lowBalanceFunds: Array<{
      fundId: string;
      name: string;
      balance: number;
    }>;
  };
  trends: {
    monthlyIncomeExpenditure: Array<{
      month: string;
      income: number;
      expenditure: number;
      net: number;
    }>;
  };
  alerts: Array<{
    title: string;
    severity: "info" | "warning" | "critical";
  }>;
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
};

const MISSION_TITHE_CATEGORIES = new Set(RCI_INCOME_CATEGORIES["Donations"] ?? []);

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

  if (periodKey === "currentMonth") {
    return buildPeriod(periodKey, new Date(Date.UTC(year, month, 1)), endOfMonth(year, month));
  }

  if (periodKey === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return buildPeriod(
      periodKey,
      new Date(Date.UTC(year, quarterStartMonth, 1)),
      endOfMonth(year, quarterStartMonth + 2),
      `Q${Math.floor(month / 3) + 1} ${year}`
    );
  }

  if (periodKey === "ytd") {
    return buildPeriod(
      periodKey,
      new Date(Date.UTC(year, 0, 1)),
      new Date(Date.UTC(year, month, now.getUTCDate())),
      `${year} YTD`
    );
  }

  const previousMonth = new Date(Date.UTC(year, month - 1, 1));
  return buildPeriod(
    periodKey,
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
}: BuildExecutiveDashboardSummaryInput): ExecutiveDashboardSummary {
  const period = getDashboardPeriod(periodKey, now);
  const activeTransactions = filterActiveTransactions(transactions);
  const reportableTransactions = filterReportableTransactions(transactions);
  const periodTransactions = activeTransactions.filter((transaction) =>
    isWithinPeriod(transaction.date, period)
  );
  const reportablePeriodTransactions = reportableTransactions.filter((transaction) =>
    isWithinPeriod(transaction.date, period)
  );
  const unrestrictedFundIds = new Set(
    funds.filter((fund) => fund.type === "Unrestricted").map((fund) => fund._id)
  );

  const periodIncome = sumByType(reportablePeriodTransactions, "Income");
  const periodExpenditure = sumByType(reportablePeriodTransactions, "Expenditure");
  const netMovement = roundCurrency(periodIncome - periodExpenditure);
  const reconciledPercent = percent(
    periodTransactions.filter((transaction) => transaction.isReconciled === true).length,
    periodTransactions.length
  );
  const categorizedPercent = percent(
    periodTransactions.filter((transaction) => Boolean(transaction.category)).length,
    periodTransactions.length
  );
  const giftAidClaimable = roundCurrency(
    sumTransactions(
      reportablePeriodTransactions.filter(
        (transaction) => transaction.type === "Income" && transaction.isGiftAidEligible === true
      )
    ) * 0.25
  );
  const missionTitheDue = roundCurrency(
    sumTransactions(
      reportablePeriodTransactions.filter(
        (transaction) =>
          transaction.type === "Income" &&
          isUnrestrictedTransaction(transaction, unrestrictedFundIds) &&
          isMissionTitheCategory(transaction.category)
      )
    ) * 0.1
  );
  const cashBankingPendingWeeks = countCashBankingPendingWeeks(
    period,
    periodTransactions,
    cashCollections,
    cashReconciliations
  );
  const evidenceCheckCount =
    periodTransactions.filter(
      (transaction) => transaction.type === "Expenditure" && transaction.isReconciled !== true
    ).length + cashBankingPendingWeeks;
  const trends = buildSixMonthTrend(period, reportableTransactions, unrestrictedFundIds);
  const generalFundBalance = roundCurrency(
    sumActiveSigned(
      reportableTransactions.filter((transaction) =>
        isUnrestrictedTransaction(transaction, unrestrictedFundIds)
      )
    )
  );
  const averageMonthlyUnrestrictedExpenditure =
    average(trends.monthlyIncomeExpenditure.map((month) => month.expenditure));
  const generalFundCoverageMonths =
    averageMonthlyUnrestrictedExpenditure > 0
      ? roundToOneDecimal(generalFundBalance / averageMonthlyUnrestrictedExpenditure)
      : null;
  const givingTrendPercent = calculateGivingTrendPercent(period, reportableTransactions, unrestrictedFundIds);
  const donorAttentionCount = countDonorAttention(period, periodTransactions, donors, pledges);
  const campaignProgress = buildCampaignProgress(funds, reportableTransactions);
  const lowBalanceFunds = buildLowBalanceFunds(funds, reportableTransactions);
  const alerts = buildAlerts(reconciledPercent, categorizedPercent);

  return {
    period,
    health: {
      operatingPosition: netMovement >= 0 ? "Healthy" : periodIncome >= periodExpenditure * 0.9 ? "Watch" : "Deficit",
      netMovement,
      givingTrendPercent,
      generalFundCoverageMonths,
      donorAttentionCount,
    },
    readiness: {
      reconciledPercent,
      categorizedPercent,
      cashBankingPendingWeeks,
      giftAidClaimable,
      missionTitheDue,
      evidenceCheckCount,
    },
    funds: {
      generalFundBalance,
      campaignProgress,
      lowBalanceFunds,
    },
    trends,
    alerts,
  };
}

function buildPeriod(
  key: DashboardPeriodKey,
  start: Date,
  end: Date,
  label = MONTH_FORMATTER.format(start)
): DashboardPeriod {
  return {
    key,
    label,
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function isWithinPeriod(date: string, period: DashboardPeriod) {
  return date >= period.startDate && date <= period.endDate;
}

function sumByType(transactions: DashboardTransaction[], type: DashboardTransaction["type"]) {
  return roundCurrency(sumTransactions(transactions.filter((transaction) => transaction.type === type)));
}

function sumTransactions(transactions: DashboardTransaction[]) {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
}

function percent(numerator: number, denominator: number) {
  return denominator === 0 ? 100 : Math.round((numerator / denominator) * 100);
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

function roundToOneDecimal(amount: number) {
  return Math.round(amount * 10) / 10;
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isUnrestrictedTransaction(transaction: DashboardTransaction, unrestrictedFundIds: Set<string>) {
  return transaction.fundId ? unrestrictedFundIds.has(transaction.fundId) : false;
}

function resolveRciCategory(category?: string) {
  return category ? CATEGORY_ALIASES[category] ?? category : "";
}

function isMissionTitheCategory(category?: string) {
  return MISSION_TITHE_CATEGORIES.has(resolveRciCategory(category));
}

function isCashOrCheque(transaction: DashboardTransaction) {
  return transaction.paymentMethod === "Cash" || transaction.paymentMethod === "Cheque";
}

function countCashBankingPendingWeeks(
  period: DashboardPeriod,
  transactions: DashboardTransaction[],
  cashCollections: DashboardCashCollection[],
  cashReconciliations: DashboardCashReconciliation[]
) {
  const completedSplits = cashReconciliations
    .filter((reconciliation) => reconciliation.status === "completed")
    .flatMap((reconciliation) => reconciliation.cashCollectionSplits ?? []);

  return cashCollections.filter((collection) => {
    if (!isWithinPeriod(collection.weekEndingDate, period)) {
      return false;
    }

    if (collection.status !== "submitted" && collection.status !== "banked") {
      return false;
    }

    const collectionTransactions = transactions.filter(
      (transaction) =>
        transaction.type === "Income" &&
        transaction.cashCollectionId === collection._id &&
        isCashOrCheque(transaction)
    );
    const expectedTotal = sumTransactions(collectionTransactions);

    if (expectedTotal <= 0) {
      return false;
    }

    const coveredTotal = completedSplits
      .filter((split) => split.cashCollectionId === collection._id)
      .reduce((sum, split) => sum + (split.cashAmount ?? 0) + (split.chequeAmount ?? 0), 0);

    return coveredTotal < expectedTotal;
  }).length;
}

function buildSixMonthTrend(
  selectedPeriod: DashboardPeriod,
  transactions: DashboardTransaction[],
  unrestrictedFundIds: Set<string>
) {
  const trendEnd = new Date(`${selectedPeriod.endDate}T00:00:00Z`);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(trendEnd.getUTCFullYear(), trendEnd.getUTCMonth() - (5 - index), 1));
    const period = buildPeriod("currentMonth", date, endOfMonth(date.getUTCFullYear(), date.getUTCMonth()));
    const monthTransactions = transactions.filter(
      (transaction) =>
        isWithinPeriod(transaction.date, period) &&
        isUnrestrictedTransaction(transaction, unrestrictedFundIds)
    );
    const income = sumByType(monthTransactions, "Income");
    const expenditure = sumByType(monthTransactions, "Expenditure");

    return {
      month: formatMonthKey(date),
      income,
      expenditure,
      net: roundCurrency(income - expenditure),
    };
  });

  return { monthlyIncomeExpenditure: months };
}

function calculateGivingTrendPercent(
  period: DashboardPeriod,
  transactions: DashboardTransaction[],
  unrestrictedFundIds: Set<string>
) {
  const currentGiving = sumTransactions(
    transactions.filter(
      (transaction) =>
        transaction.type === "Income" &&
        isWithinPeriod(transaction.date, period) &&
        isUnrestrictedTransaction(transaction, unrestrictedFundIds) &&
        isMissionTitheCategory(transaction.category)
    )
  );
  const periodMonthCount = countMonthsInclusive(period.startDate, period.endDate);
  const currentMonthlyAverage = periodMonthCount > 1 ? currentGiving / periodMonthCount : currentGiving;
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const comparisonEnd = periodMonthCount > 1
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0))
    : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 0));
  const comparisonStart = new Date(Date.UTC(comparisonEnd.getUTCFullYear(), comparisonEnd.getUTCMonth() - 2, 1));
  const comparisonPeriod: DashboardPeriod = {
    key: "quarter",
    label: "",
    startDate: formatDate(comparisonStart),
    endDate: formatDate(comparisonEnd),
  };
  const comparisonGiving = sumTransactions(
    transactions.filter(
      (transaction) =>
        transaction.type === "Income" &&
        isWithinPeriod(transaction.date, comparisonPeriod) &&
        isUnrestrictedTransaction(transaction, unrestrictedFundIds) &&
        isMissionTitheCategory(transaction.category)
    )
  );
  const comparisonAverage = comparisonGiving / 3;

  return comparisonAverage > 0
    ? Math.round(((currentMonthlyAverage - comparisonAverage) / comparisonAverage) * 100)
    : 0;
}

function countMonthsInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth() +
    1
  );
}

function countDonorAttention(
  period: DashboardPeriod,
  transactions: DashboardTransaction[],
  donors: DashboardDonor[],
  pledges: DashboardPledge[]
) {
  const attentionKeys = new Set<string>();

  transactions.forEach((transaction) => {
    if (transaction.donorId && transaction.type === "Income" && transaction.isGiftAidEligible !== true) {
      attentionKeys.add(`donor:${transaction.donorId}`);
    }
  });

  transactions.forEach((transaction) => {
    if (transaction.donorId && transaction.type === "Income") {
      const donor = donors.find((candidate) => candidate._id === transaction.donorId);
      if (donor?.type === "Individual" && donor.isGiftAidActive !== true) {
        attentionKeys.add(`donor:${transaction.donorId}`);
      }
    }
  });

  pledges
    .filter((pledge) => pledge.status === "Active" && pledge.startDate <= period.endDate)
    .forEach((pledge) => {
      const hasPeriodGiving = transactions.some((transaction) =>
        isPledgeSatisfiedByTransaction(pledge, transaction)
      );
      if (!hasPeriodGiving) {
        attentionKeys.add(`pledge:${pledge._id}`);
      }
    });

  return attentionKeys.size;
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

function buildCampaignProgress(funds: DashboardFund[], transactions: DashboardTransaction[]) {
  const campaign = funds.find((fund) => fund.targetAmount && fund.targetAmount > 0);

  if (!campaign?.targetAmount) {
    return undefined;
  }

  const balance = roundCurrency(sumActiveSigned(transactions.filter((transaction) => transaction.fundId === campaign._id)));

  return {
    fundId: campaign._id,
    name: campaign.name,
    progressPercent: percent(balance, campaign.targetAmount),
    balance,
    targetAmount: campaign.targetAmount,
  };
}

function buildLowBalanceFunds(funds: DashboardFund[], transactions: DashboardTransaction[]) {
  return funds
    .map((fund) => ({
      fundId: fund._id,
      name: fund.name,
      balance: roundCurrency(sumActiveSigned(transactions.filter((transaction) => transaction.fundId === fund._id))),
      targetAmount: fund.targetAmount,
    }))
    .filter((fund) => fund.balance < 1000 || (fund.targetAmount ? percent(fund.balance, fund.targetAmount) < 25 : false))
    .map(({ fundId, name, balance }) => ({ fundId, name, balance }));
}

function buildAlerts(reconciledPercent: number, categorizedPercent: number) {
  const alerts: ExecutiveDashboardSummary["alerts"] = [];

  if (reconciledPercent < 95 || categorizedPercent < 95) {
    alerts.push({
      title: "Month-end review needs attention",
      severity: "warning",
    });
  }

  return alerts;
}
