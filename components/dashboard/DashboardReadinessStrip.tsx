import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  ReceiptText,
  Tags,
} from "lucide-react";
import type { DashboardSummaryProps } from "./types";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function DashboardReadinessStrip({ summary }: DashboardSummaryProps) {
  const { readiness } = summary;
  const items = [
    {
      label: "Reconciled",
      value: `${readiness.reconciledPercent}%`,
      status: readiness.reconciledPercent >= 95 ? "Ready" : "Review",
      complete: readiness.reconciledPercent >= 95,
      icon: CheckCircle2,
    },
    {
      label: "Categorized",
      value: `${readiness.categorizedPercent}%`,
      status: readiness.categorizedPercent >= 95 ? "Ready" : "Review",
      complete: readiness.categorizedPercent >= 95,
      icon: Tags,
    },
    {
      label: "Cash Banked",
      value: readiness.cashBankingPendingWeeks.toLocaleString("en-GB"),
      status: readiness.cashBankingPendingWeeks === 0 ? "Clear" : "Weeks pending",
      complete: readiness.cashBankingPendingWeeks === 0,
      icon: Banknote,
    },
    {
      label: "Gift Aid",
      value: currencyFormatter.format(readiness.giftAidClaimable),
      status: "Claimable",
      complete: readiness.giftAidClaimable > 0,
      icon: ReceiptText,
    },
    {
      label: "Mission Tithe",
      value: currencyFormatter.format(readiness.missionTitheDue),
      status: "Due",
      complete: readiness.missionTitheDue > 0,
      icon: HandCoins,
    },
    {
      label: "Evidence/Large Payments",
      value: readiness.evidenceCheckCount.toLocaleString("en-GB"),
      status: readiness.evidenceCheckCount === 0 ? "Clear" : "Check",
      complete: readiness.evidenceCheckCount === 0,
      icon: ClipboardCheck,
    },
  ];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-ledger">
        {items.map(({ label, value, status, complete, icon: Icon }) => (
          <div key={label} className="p-4 min-w-0">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`p-2 rounded-lg border shrink-0 ${
                  complete
                    ? "bg-sage-light border-sage text-sage"
                    : "bg-amber-light border-amber text-amber"
                }`}
              >
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
                  className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide break-words ${
                    complete ? "text-sage-dark" : "text-amber-dark"
                  }`}
                >
                  {status}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
