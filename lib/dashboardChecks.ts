import type { ExecutiveDashboardSummary } from "./dashboardKpis";
import { can, type UserRole } from "./permissions";

export type MonthEndCheckStatus = "critical" | "attention" | "info" | "clear";

export type MonthEndCheck = {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: MonthEndCheckStatus;
  href?: string;
};

const STATUS_RANK: Record<MonthEndCheckStatus, number> = {
  critical: 0,
  attention: 1,
  info: 2,
  clear: 3,
};

const COMPLETE_PERCENT = 95;

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// Rows only link to pages the role can open.
export function buildMonthEndChecks(
  summary: ExecutiveDashboardSummary,
  { role, bankFeedIssues }: { role: UserRole; bankFeedIssues: number }
): MonthEndCheck[] {
  const { readiness, funds } = summary;
  const transactionsHref = "/transactions";
  const reportsHref = can(role, "reports.read") ? "/reports" : undefined;
  const checks: MonthEndCheck[] = [
    percentCheck("reconciled", "Transactions reconciled", readiness.reconciledPercent, transactionsHref),
    percentCheck("categorised", "Transactions categorised", readiness.categorizedPercent, transactionsHref),
    countCheck(
      "unreconciled-spend",
      "Unreconciled spending",
      readiness.unreconciledExpenditureCount,
      "Payments to match to the bank",
      transactionsHref
    ),
    countCheck(
      "cash-banking",
      "Cash awaiting banking",
      readiness.cashBankingPendingWeeks,
      "Weeks of collections not yet matched to a deposit",
      transactionsHref
    ),
    {
      id: "gift-aid",
      label: "Gift Aid claimable",
      value: currency.format(readiness.giftAidClaimable),
      detail: "25% of eligible giving this period",
      status: readiness.giftAidClaimable > 0 ? "info" : "clear",
      href: reportsHref,
    },
    {
      id: "mission-tithe",
      label: "Mission tithe due",
      value: currency.format(readiness.missionTitheDue),
      detail: "10% of unrestricted giving this period",
      status: readiness.missionTitheDue > 0 ? "info" : "clear",
      href: reportsHref,
    },
  ];

  if (bankFeedIssues > 0) {
    checks.push({
      id: "bank-feeds",
      label: "Bank feeds",
      value: bankFeedIssues.toLocaleString("en-GB"),
      detail: "Connections need reconnecting before the next sync",
      status: "critical",
      href: can(role, "settings.view") ? "/settings?tab=bank" : undefined,
    });
  }

  if (funds.overdrawnFunds.length > 0) {
    checks.push({
      id: "overdrawn-funds",
      label: "Overdrawn funds",
      value: funds.overdrawnFunds.length.toLocaleString("en-GB"),
      detail: funds.overdrawnFunds.map((fund) => fund.name).join(", "),
      status: "critical",
      href: "/funds",
    });
  }

  if (readiness.statementsBehind.length > 0) {
    checks.push({
      id: "statements",
      label: "Bank statements",
      value: readiness.statementsBehind.length.toLocaleString("en-GB"),
      detail: `Accounts not reconciled to ${formatShortDate(readiness.statementsDueThrough)}`,
      status: "attention",
      href: transactionsHref,
    });
  }

  return checks.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

function percentCheck(
  id: string,
  label: string,
  percent: number | null,
  href: string
): MonthEndCheck {
  if (percent === null) {
    return { id, label, value: "None", detail: "No transactions this period", status: "clear", href };
  }

  return {
    id,
    label,
    value: `${percent}%`,
    detail: percent >= COMPLETE_PERCENT ? "Ready for review" : `Below the ${COMPLETE_PERCENT}% review threshold`,
    status: percent >= COMPLETE_PERCENT ? "clear" : "attention",
    href,
  };
}

function countCheck(
  id: string,
  label: string,
  count: number,
  detail: string,
  href: string
): MonthEndCheck {
  return {
    id,
    label,
    value: count.toLocaleString("en-GB"),
    detail,
    status: count === 0 ? "clear" : "attention",
    href,
  };
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
