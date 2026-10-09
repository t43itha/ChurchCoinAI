import { can } from "../lib/permissions";
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { Banknote } from "lucide-react";
import { api } from "../convex/_generated/api";
import { roundMoney, sumMoney } from "../convex/lib/money";
import { AppUser, Category, Fund } from "../types";
import CashEntryWizard from "./cashEntry/CashEntryWizard";
import DashboardFundsToWatch from "./dashboard/DashboardFundsToWatch";
import DashboardTrendPanel from "./dashboard/DashboardTrendPanel";
import { formatCurrency } from "./dashboard/formatters";
import { buildDashboardNeedsYou } from "./dashboard/needsYou";
import type { DashboardPeriodKey } from "./dashboard/types";
import HeroCard from "./hub/HeroCard";
import HubHeader from "./hub/HubHeader";
import HubLayout from "./hub/HubLayout";
import { NeedsYou, NeedsYouItem } from "./hub/NeedsYou";
import SectionTitle from "./hub/SectionTitle";
import { ReceiptCard, ReceiptRow } from "./wizard/Receipt";
import { btnMd, btnPrimary, chipDark, chipDarkOn, eyebrow } from "./wizard/ui";
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

const penceFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const Dashboard: React.FC<DashboardProps> = ({ funds, categories, currentUser }) => {
  const [periodKey, setPeriodKey] = useState<DashboardPeriodKey>("previousMonth");
  const [isChoosingPeriod, setIsChoosingPeriod] = useState(false);
  const [showCashTakingsModal, setShowCashTakingsModal] = useState(false);
  const canEdit = can(currentUser.role, "cashCollections.write");
  const canOpenDonors = can(currentUser.role, "donors.read");
  const navigate = useNavigate();
  const summary = useQuery(api.queries.dashboard.executiveSummary, {
    periodKey,
    today: formatLocalDateInputValue(new Date()),
  });
  const bankConnections = useQuery(api.queries.bankConnections.list);
  const bankFeedsNeedingAttention = useQuery(api.queries.bankConnections.getItemsNeedingAttention);

  if (summary === undefined) {
    return <LoadingSpinner message="Loading leadership dashboard..." />;
  }

  const { period, health, funds: fundFigures, readiness, donorFollowUp } = summary;
  const needsYou = buildDashboardNeedsYou(summary, {
    role: currentUser.role,
    bankFeedIssues: bankFeedsNeedingAttention?.length ?? 0,
    canOpenDonors,
  });
  const generalFund = fundFigures.generalFundBalance;
  const restrictedFund = fundFigures.restrictedBalance;
  const fundsHeld = sumMoney([generalFund, restrictedFund], (balance) => balance);
  const title = period.key === "currentMonth" ? `${monthName(period.startDate)} so far` : period.label;
  const needsYouCount = needsYou.length === 1 ? "1 thing needs you." : `${needsYou.length} things need you.`;

  const openNewCash = () => setShowCashTakingsModal(true);

  return (
    <div className="animate-enter pb-12">
      <HubLayout
        receipt={
          <>
            <ReceiptCard>
              <p className={eyebrow}>{period.label}</p>
              <div className="mt-2">
                <ReceiptRow label="Net movement" value={signedPence(health.netMovement)} />
                <ReceiptRow label="General fund" value={penceFormatter.format(generalFund)} sub />
                <ReceiptRow label="Restricted funds" value={penceFormatter.format(restrictedFund)} sub />
                <ReceiptRow
                  label="Giving trend"
                  value={health.givingTrendPercent === null ? "No baseline" : signedPercent(health.givingTrendPercent)}
                  muted={health.givingTrendPercent === null}
                />
                <ReceiptRow
                  label="General fund cover"
                  value={
                    health.generalFundCoverageMonths === null
                      ? "No spend"
                      : `${health.generalFundCoverageMonths.toFixed(1)} months`
                  }
                  muted={health.generalFundCoverageMonths === null}
                />
              </div>
            </ReceiptCard>

            {readiness.giftAidClaimable !== null && (
              <ReceiptCard>
                <p className={eyebrow}>Gift Aid</p>
                <div className="mt-2">
                  <ReceiptRow label="To claim (25%)" value={penceFormatter.format(readiness.giftAidClaimable)} />
                  {donorFollowUp.missedGiftAidCount !== null && (
                    <ReceiptRow
                      label="Gifts missing Gift Aid"
                      value={
                        <span className={donorFollowUp.missedGiftAidCount > 0 ? "text-[#a9743f]" : undefined}>
                          {donorFollowUp.missedGiftAidCount.toLocaleString("en-GB")}
                        </span>
                      }
                    />
                  )}
                </div>
              </ReceiptCard>
            )}

            <p className="px-1 text-xs leading-snug text-grey-mid">
              Figures exclude voided rows and cash banking deposits.
            </p>
          </>
        }
      >
        <HubHeader
          eyebrow={todayLabel()}
          title={title}
          status={
            <>
              <DataFreshness connections={bankConnections} />
              {needsYou.length > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-amber">{needsYouCount}</span>
                </>
              )}
            </>
          }
          actions={
            canEdit ? (
              <button type="button" onClick={openNewCash} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
                <Banknote size={16} aria-hidden="true" />
                Record giving
              </button>
            ) : null
          }
        />

        <HeroCard
          label="Funds held"
          value={formatCurrency(fundsHeld)}
          sub={
            <p>
              <NetMovement amount={health.netMovement} /> · {period.label} ·{" "}
              <button
                type="button"
                aria-expanded={isChoosingPeriod}
                aria-controls="dashboard-period"
                onClick={() => setIsChoosingPeriod((open) => !open)}
                className="font-semibold text-white underline underline-offset-4"
              >
                change
              </button>
            </p>
          }
          segments={[
            {
              label: "Unrestricted",
              value: formatCurrency(generalFund),
              amount: generalFund,
              colour: "#a9cfa9",
            },
            {
              label: "Restricted",
              value: formatCurrency(restrictedFund),
              amount: restrictedFund,
              colour: "#8f877e",
            },
          ]}
        >
          {isChoosingPeriod && (
            <div id="dashboard-period" role="group" aria-label="Period" className="mt-4 flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map((option) => {
                const on = option.key === periodKey;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setPeriodKey(option.key);
                      setIsChoosingPeriod(false);
                    }}
                    className={on ? chipDarkOn : chipDark}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </HeroCard>

        <div className="space-y-3">
          <SectionTitle>Needs you</SectionTitle>
          <NeedsYou>
            {needsYou.map((row) => (
              <NeedsYouItem
                key={row.id}
                tone={row.tone}
                icon={row.icon}
                title={row.title}
                detail={row.detail}
                action={row.action}
                href={row.href}
              />
            ))}
          </NeedsYou>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DashboardTrendPanel summary={summary} />
          <DashboardFundsToWatch summary={summary} />
        </div>
      </HubLayout>

      {showCashTakingsModal && canEdit ? (
        <CashEntryWizard
          funds={funds}
          categories={categories}
          storageScope={currentUser._id}
          onClose={() => setShowCashTakingsModal(false)}
          onBankIt={
            can(currentUser.role, "reconciliation.manage")
              ? () => navigate("/transactions?view=cash-banking")
              : undefined
          }
        />
      ) : null}
    </div>
  );
};

type BankConnectionSummary = {
  lastSyncAt?: number;
};

const STALE_SYNC_DAYS = 7;

// The oldest feed bounds how current the figures are, so one fresh feed
// cannot vouch for the others.
function DataFreshness({ connections }: { connections: BankConnectionSummary[] | undefined }) {
  if (connections === undefined) {
    return null;
  }

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
    <span className={isStale ? "text-[#a9743f]" : undefined}>
      {message}
      {isStale ? " Sync before relying on these figures." : null}
    </span>
  );
}

function NetMovement({ amount }: { amount: number }) {
  if (amount === 0) return <span>Breaking even</span>;
  if (amount > 0) {
    return <span className="font-semibold text-[#a9cfa9]">+{formatCurrency(amount)} surplus</span>;
  }
  return <span className="font-semibold text-[#f4a6a6]">−{formatCurrency(Math.abs(amount))} deficit</span>;
}

function signedPence(amount: number) {
  const prefix = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${prefix}${penceFormatter.format(roundMoney(Math.abs(amount)))}`;
}

function signedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

function monthName(date: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

function formatSyncDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default Dashboard;
