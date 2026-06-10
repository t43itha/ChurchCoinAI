import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { Banknote, CalendarRange, ChevronDown, UsersRound } from "lucide-react";
import { api } from "../convex/_generated/api";
import { AppUser, Category, Fund } from "../types";
import CashTakingsEntry from "./CashTakingsEntry";
import DashboardFundHealth from "./dashboard/DashboardFundHealth";
import DashboardHealthCards from "./dashboard/DashboardHealthCards";
import DashboardLeadershipAlerts from "./dashboard/DashboardLeadershipAlerts";
import DashboardReadinessStrip from "./dashboard/DashboardReadinessStrip";
import DashboardTrendPanel from "./dashboard/DashboardTrendPanel";
import type { DashboardPeriodKey } from "./dashboard/types";
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
  const canEdit = ["Admin", "Finance Team"].includes(currentUser.role);
  const summary = useQuery(api.queries.dashboard.executiveSummary, { periodKey });
  const selectedPeriodLabel =
    summary?.period.label ?? PERIOD_OPTIONS.find((period) => period.key === periodKey)?.label;

  return (
    <div className="space-y-[22px] animate-enter max-w-7xl mx-auto pb-12">
      <header className="swiss-card-static p-6 md:p-[26px] flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <h2 className="text-[32px] md:text-4xl leading-tight font-bold text-ink tracking-tight">
            Leadership Dashboard
          </h2>
          <p className="mt-2 text-[15px] text-grey-mid font-medium max-w-2xl">
            Controls, cash position, fund health, and donor follow-up at a glance.
          </p>
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
                className="w-full appearance-none bg-white border border-ledger rounded-lg pl-9 pr-9 py-2 text-sm font-semibold text-ink normal-case tracking-normal focus:outline-none focus:ring-[3px] focus:ring-ink/10 focus:border-ink"
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
          <DashboardReadinessStrip summary={summary} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5">
            <div className="xl:col-span-2 min-w-0">
              <DashboardTrendPanel summary={summary} />
            </div>
            <DashboardLeadershipAlerts summary={summary} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-5">
            <div className="xl:col-span-2">
              <DashboardFundHealth summary={summary} />
            </div>
            <section
              className="swiss-card bg-white overflow-hidden"
              aria-label="Pastoral follow-up"
            >
              <div className="px-6 py-[18px] border-b border-[#efeee9] flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-lg bg-amber-light text-[#c79a5f] shrink-0">
                    <UsersRound size={18} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em] break-words">
                      Pastoral Follow-Up
                    </h3>
                    <p className="text-[13.5px] text-grey-mid font-medium mt-1 leading-snug">
                      Aggregate attention count for {summary.period.label}
                    </p>
                  </div>
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-grey-mid shrink-0">
                  Private
                </span>
              </div>

              <div className="p-6">
                <p className="text-[40px] leading-none font-bold text-ink font-mono tabular-nums tracking-tight">
                  {summary.health.donorAttentionCount.toLocaleString("en-GB")}
                </p>
                <p className="mt-4 text-sm text-grey-mid font-medium leading-relaxed">
                  Giving records, pledge status, or Gift Aid details may need
                  review. Donor identities are kept out of this leadership view.
                </p>
              </div>
            </section>
          </div>
        </>
      )}

      {showCashTakingsModal && canEdit ? (
        <CashTakingsEntry
          funds={funds}
          categories={categories}
          onClose={() => setShowCashTakingsModal(false)}
          onSuccess={(result) => {
            console.log(`Cash collection created: ${result.transactionCount} transactions`);
          }}
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
