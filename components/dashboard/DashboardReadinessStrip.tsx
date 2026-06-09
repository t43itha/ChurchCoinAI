import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  ReceiptText,
  Tags,
} from "lucide-react";
import { formatCurrency } from "./formatters";
import type { DashboardSummaryProps } from "./types";

type ReadinessTone = "ready" | "attention" | "neutral";

const toneClasses: Record<ReadinessTone, { icon: string; status: string }> = {
  ready: {
    icon: "bg-sage-light border-sage text-sage",
    status: "text-sage-dark",
  },
  attention: {
    icon: "bg-amber-light border-amber text-amber",
    status: "text-amber-dark",
  },
  neutral: {
    icon: "bg-grey-light border-ledger text-grey-mid",
    status: "text-grey-mid",
  },
};

export default function DashboardReadinessStrip({ summary }: DashboardSummaryProps) {
  const { readiness } = summary;
  const items = [
    {
      label: "Reconciled",
      value: `${readiness.reconciledPercent}%`,
      status: readiness.reconciledPercent >= 95 ? "Ready" : "Review",
      tone: readiness.reconciledPercent >= 95 ? "ready" : "attention",
      icon: CheckCircle2,
    },
    {
      label: "Categorized",
      value: `${readiness.categorizedPercent}%`,
      status: readiness.categorizedPercent >= 95 ? "Ready" : "Review",
      tone: readiness.categorizedPercent >= 95 ? "ready" : "attention",
      icon: Tags,
    },
    {
      label: "Cash Banked",
      value: readiness.cashBankingPendingWeeks.toLocaleString("en-GB"),
      status: readiness.cashBankingPendingWeeks === 0 ? "Clear" : "Weeks pending",
      tone: readiness.cashBankingPendingWeeks === 0 ? "ready" : "attention",
      icon: Banknote,
    },
    {
      label: "Gift Aid",
      value: formatCurrency(readiness.giftAidClaimable),
      status: readiness.giftAidClaimable > 0 ? "Claimable" : "Opportunity",
      tone: "neutral",
      icon: ReceiptText,
    },
    {
      label: "Mission Tithe",
      value: formatCurrency(readiness.missionTitheDue),
      status: readiness.missionTitheDue > 0 ? "Due" : "Clear",
      tone: readiness.missionTitheDue > 0 ? "attention" : "ready",
      icon: HandCoins,
    },
    {
      label: "Evidence/Large Payments",
      value: readiness.evidenceCheckCount.toLocaleString("en-GB"),
      status: readiness.evidenceCheckCount === 0 ? "Clear" : "Check",
      tone: readiness.evidenceCheckCount === 0 ? "ready" : "attention",
      icon: ClipboardCheck,
    },
  ] satisfies Array<{
    label: string;
    value: string;
    status: string;
    tone: ReadinessTone;
    icon: typeof CheckCircle2;
  }>;

  return (
    <section className="swiss-card bg-white overflow-hidden" aria-label="Month-end readiness">
      <div className="px-5 py-4 border-b border-ledger bg-paper flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-sm uppercase tracking-wide">
            Month-End Readiness
          </h3>
          <p className="text-xs text-grey-mid font-medium break-words">
            {summary.period.label} control checks
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-px bg-ledger">
        {items.map(({ label, value, status, tone, icon: Icon }) => {
          const classes = toneClasses[tone];

          return (
            <div key={label} className="p-4 min-w-0 bg-white">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-2 rounded-lg border shrink-0 ${classes.icon}`}>
                  <Icon size={16} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide break-words">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-bold text-ink font-mono break-words">
                    {value}
                  </p>
                  <p
                    className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide break-words ${classes.status}`}
                  >
                    {status}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
