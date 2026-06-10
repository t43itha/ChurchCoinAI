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

// Refined Ledger tone palette: borderless wash chips, text-only status tags
const toneClasses: Record<ReadinessTone, { chip: string; status: string }> = {
  ready: {
    chip: "bg-sage-light text-[#6b8e6b]",
    status: "text-[#557555]",
  },
  attention: {
    chip: "bg-amber-light text-[#c79a5f]",
    status: "text-[#a9743f]",
  },
  neutral: {
    chip: "bg-[#f3f1ed] text-grey-mid",
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
  const attentionCount = items.filter((item) => item.tone === "attention").length;

  return (
    <section className="swiss-card-static overflow-hidden" aria-label="Month-end readiness">
      <div className="px-6 md:px-7 py-[18px] md:py-[22px] border-b border-[#efeee9] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em] whitespace-nowrap">
            Month-End Readiness
          </h3>
          <p className="text-[13.5px] text-grey-mid font-medium mt-1 break-words">
            {summary.period.label} control checks
          </p>
        </div>
        <span
          className={`w-fit text-[10.5px] font-bold uppercase tracking-[0.1em] ${
            attentionCount === 0 ? "text-[#557555]" : "text-[#a9743f]"
          }`}
        >
          {attentionCount === 0 ? "Ready to review" : `${attentionCount} to review`}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-[#efeee9]">
        {items.map(({ label, value, status, tone, icon: Icon }) => {
          const classes = toneClasses[tone];

          return (
            <div key={label} className="px-6 py-[22px] md:py-[26px] min-w-0 bg-white flex flex-col items-start gap-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`inline-flex items-center justify-center w-[38px] h-[38px] rounded-lg shrink-0 ${classes.chip}`}>
                  <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-grey-mid uppercase tracking-[0.07em] break-words">
                  {label}
                </span>
              </div>
              <p className="text-[28px] leading-none font-bold text-ink font-mono tabular-nums tracking-tight break-words">
                {value}
              </p>
              <p
                className={`text-[10.5px] font-bold uppercase tracking-[0.1em] break-words ${classes.status}`}
              >
                {status}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
