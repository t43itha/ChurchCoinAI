import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { Banknote, UsersRound } from "lucide-react";
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
  { key: "previousMonth", label: "Previous month" },
  { key: "currentMonth", label: "Current month" },
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
    <div className="space-y-6 animate-enter max-w-6xl mx-auto pb-12">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 border-b border-ledger pb-6">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold text-ink tracking-tight">
            Leadership Dashboard
          </h2>
          <p className="text-grey-mid mt-1 text-sm font-medium break-words">
            {selectedPeriodLabel}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-grey-mid uppercase tracking-wide">
            Period
            <select
              value={periodKey}
              onChange={(event) => setPeriodKey(event.target.value as DashboardPeriodKey)}
              className="bg-white border border-ledger rounded-md px-3 py-2 text-sm font-bold text-ink normal-case tracking-normal shadow-[2px_2px_0px_rgba(0,0,0,1)] focus:outline-none focus:ring-2 focus:ring-amber"
            >
              {PERIOD_OPTIONS.map((period) => (
                <option key={period.key} value={period.key}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowCashTakingsModal(true)}
              className="btn-primary hidden md:inline-flex items-center justify-center gap-2"
            >
              <Banknote size={16} aria-hidden="true" />
              Record Cash
            </button>
          ) : null}
        </div>
      </header>

      {summary === undefined ? (
        <LoadingSpinner message="Loading leadership dashboard..." />
      ) : (
        <>
          <DashboardHealthCards summary={summary} />
          <DashboardReadinessStrip summary={summary} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 min-w-0">
              <DashboardTrendPanel summary={summary} />
            </div>
            <DashboardLeadershipAlerts summary={summary} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <DashboardFundHealth summary={summary} />
            </div>
            <section
              className="swiss-card bg-white overflow-hidden"
              aria-label="Pastoral follow-up"
            >
              <div className="p-5 border-b border-ledger bg-paper flex items-start gap-3">
                <div className="p-2 rounded-lg border bg-amber-light border-amber text-amber shrink-0">
                  <UsersRound size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-ink text-sm uppercase tracking-wide break-words">
                    Pastoral Follow-Up
                  </h3>
                  <p className="text-xs text-grey-mid font-medium mt-1 leading-snug">
                    Aggregate attention count for {summary.period.label}
                  </p>
                </div>
              </div>

              <div className="p-6">
                <p className="text-4xl font-bold text-ink font-mono">
                  {summary.health.donorAttentionCount.toLocaleString("en-GB")}
                </p>
                <p className="mt-3 text-sm text-grey-mid font-medium leading-snug">
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
              className="fixed bottom-6 right-6 w-14 h-14 bg-sage text-white rounded-full shadow-lg flex items-center justify-center z-30 md:hidden hover:bg-sage-dark transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"
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

export default Dashboard;
