import { can } from "../lib/permissions";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { Banknote, CalendarRange, ChevronDown } from "lucide-react";
import { api } from "../convex/_generated/api";
import { AppUser, Category, Fund } from "../types";
import CashEntryWizard from "./cashEntry/CashEntryWizard";
import DashboardDonorFollowUp from "./dashboard/DashboardDonorFollowUp";
import DashboardFundHealth from "./dashboard/DashboardFundHealth";
import DashboardHealthCards from "./dashboard/DashboardHealthCards";
import DashboardMonthEndChecks from "./dashboard/DashboardMonthEndChecks";
import DashboardTrendPanel from "./dashboard/DashboardTrendPanel";
import { buildMonthEndChecks } from "../lib/dashboardChecks";
import type { DashboardPeriodKey } from "./dashboard/types";
import { formatLocalDateInputValue } from "../lib/dateUtils";
import LoadingSpinner from "./LoadingSpinner";

interface DashboardProps {
  funds: Fund[];
  categories: Category[];
  currentUser: AppUser;
}

const PERIOD_OPTIONS: Array<{ key: DashboardPeriodKey; label: string }> = [
  { key: "previousMonth", label: "Last month" },
  { key: "currentMonth", label: "This month" },
  { key: "quarter", label: "Quarter" },
  { key: "ytd", label: "Year to date" },
];

const Dashboard: React.FC<DashboardProps> = ({ funds, categories, currentUser }) => {
  const [periodKey, setPeriodKey] = useState<DashboardPeriodKey>("previousMonth");
  const [showCashTakingsModal, setShowCashTakingsModal] = useState(false);
  const canEdit = can(currentUser.role, "cashCollections.write");
  const navigate = useNavigate();
  const summary = useQuery(api.queries.dashboard.executiveSummary, {
    periodKey,
    today: formatLocalDateInputValue(new Date()),
  });
  const bankConnections = useQuery(api.queries.bankConnections.list);
  const bankFeedsNeedingAttention = useQuery(api.queries.bankConnections.getItemsNeedingAttention);
  const selectedPeriodLabel =
    summary?.period.label ?? PERIOD_OPTIONS.find((period) => period.key === periodKey)?.label;

  return (
    <div className="ledger-space-y-[22px] animate-enter max-w-7xl mx-auto pb-12">
      <header className="swiss-card-static p-6 md:p-[26px] flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <h2 className="text-[32px] md:text-4xl leading-tight font-bold text-ink tracking-tight">
            Leadership Dashboard
          </h2>
          <DataFreshness connections={bankConnections} />
        </div>

        <div className="w-full lg:w-auto lg:min-w-[360px] bg-[#fcfbf9] border border-ledger rounded-xl p-3">
          <div className="flex items-center justify-between gap-3 mb-2 px-0.5">
            <span className="font-mono text-[10.5px] font-semibold text-grey-mid uppercase tracking-[0.1em]">
              Period
            </span>
            <span className="font-mono text-[10.5px] font-medium text-grey-mid">
              {summary ? formatDisplayDate(summary.period.endDate) : selectedPeriodLabel}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Period</span>
              <CalendarRange
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none"
                aria-hidden="true"
              />
              <select
                value={periodKey}
                onChange={(event) => setPeriodKey(event.target.value as DashboardPeriodKey)}
                className="w-full appearance-none bg-white border border-ledger rounded-lg pl-9 pr-9 py-2 text-sm font-semibold text-ink normal-case tracking-normal focus:outline-hidden focus:ring-[3px] focus:ring-ink/10 focus:border-ink"
              >
                {PERIOD_OPTIONS.map((period) => (
                  <option key={period.key} value={period.key}>
                    {period.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink pointer-events-none"
                aria-hidden="true"
              />
            </label>

            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowCashTakingsModal(true)}
                className="btn-primary hidden md:inline-flex items-center justify-center gap-2 px-4 py-2 min-w-36 text-xs font-bold uppercase whitespace-nowrap"
              >
                <Banknote size={16} aria-hidden="true" />
                Record Cash
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {summary === undefined ? (
        <LoadingSpinner message="Loading leadership dashboard..." />
      ) : (
        <>
          <DashboardHealthCards summary={summary} />

          <DashboardMonthEndChecks
            periodLabel={summary.period.label}
            checks={buildMonthEndChecks(summary, {
              role: currentUser.role,
              bankFeedIssues: bankFeedsNeedingAttention?.length ?? 0,
            })}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5">
            <div className="xl:col-span-2 min-w-0">
              <DashboardTrendPanel summary={summary} />
            </div>
            <DashboardDonorFollowUp
              summary={summary}
              canOpenDonors={can(currentUser.role, "donors.read")}
            />
          </div>

          <DashboardFundHealth summary={summary} />
        </>
      )}

      {showCashTakingsModal && canEdit ? (
        <CashEntryWizard
          funds={funds}
          categories={categories}
          onClose={() => setShowCashTakingsModal(false)}
          onBankIt={
            can(currentUser.role, "reconciliation.manage")
              ? () => navigate("/transactions?view=cash-banking")
              : undefined
          }
        />
      ) : null}

      {canEdit
        ? createPortal(
            <button
              type="button"
              onClick={() => setShowCashTakingsModal(true)}
              className="fixed bottom-6 right-6 w-14 h-14 bg-sage text-white rounded-full shadow-soft-lg flex items-center justify-center z-30 md:hidden hover:bg-sage-dark transition-colors"
              aria-label="Record Cash Collection"
            >
              <Banknote size={24} />
            </button>,
            document.body
          )
        : null}
    </div>
  );
};

type BankConnectionSummary = {
  lastSyncAt?: number;
};

const STALE_SYNC_DAYS = 7;

function DataFreshness({ connections }: { connections: BankConnectionSummary[] | undefined }) {
  if (connections === undefined) {
    return <p className="mt-2 h-[22px]" aria-hidden="true" />;
  }

  // The oldest feed bounds how current the figures are, so one fresh feed
  // cannot vouch for the others.
  const oldestSyncAt = Math.min(...connections.map((connection) => connection.lastSyncAt ?? 0));
  const message =
    connections.length === 0
      ? "No bank feed connected. Figures cover entered and imported transactions."
      : oldestSyncAt === 0
        ? "A bank feed has not synced yet."
        : connections.length === 1
          ? `Bank data last synced ${formatSyncDate(oldestSyncAt)}.`
          : `All bank feeds synced since ${formatSyncDate(oldestSyncAt)}.`;
  const isStale =
    connections.length > 0 && Date.now() - oldestSyncAt > STALE_SYNC_DAYS * 24 * 60 * 60 * 1000;

  return (
    <p
      className={`mt-2 text-[15px] font-medium max-w-2xl ${
        isStale ? "text-[#a9743f]" : "text-grey-mid"
      }`}
    >
      {message}
      {isStale ? " Sync before relying on these figures." : null}
    </p>
  );
}

function formatSyncDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export default Dashboard;
