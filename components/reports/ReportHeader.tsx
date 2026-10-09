import React, { type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented, eyebrow as eyebrowClass } from "../wizard/ui";
import type { DataReadiness } from "../../lib/reportSummary";
import { ExportMenu, type ExportActions } from "./ExportMenu";
import { READY_THRESHOLD } from "./format";

export type ReportTab = "monthly" | "annual" | "ai";

const TAB_ORDER: ReportTab[] = ["monthly", "annual", "ai"];
const TAB_LABELS: Record<ReportTab, string> = { monthly: "Monthly", annual: "Annual", ai: "AI reports" };
const TAB_OPTIONS = TAB_ORDER.map((tab) => TAB_LABELS[tab]);

// "96% categorised · 88% reconciled", with any figure under the threshold in amber.
export const ReadinessLine: React.FC<{ readiness: DataReadiness; lead?: string }> = ({ readiness, lead }) => {
  const pieces: { text: string; weak: boolean }[] = [];
  if (lead) pieces.push({ text: lead, weak: false });
  if (readiness.categorisedPercent !== null) {
    pieces.push({
      text: `${readiness.categorisedPercent}% categorised`,
      weak: readiness.categorisedPercent < READY_THRESHOLD,
    });
  }
  if (readiness.reconciledPercent !== null) {
    pieces.push({
      text: `${readiness.reconciledPercent}% reconciled`,
      weak: readiness.reconciledPercent < READY_THRESHOLD,
    });
  }
  return (
    <span>
      {pieces.map((piece, index) => (
        <span key={piece.text}>
          {index > 0 && " · "}
          <span className={piece.weak ? "font-semibold text-amber" : undefined}>{piece.text}</span>
        </span>
      ))}
    </span>
  );
};

export interface ReportStepper {
  onPrevious: () => void;
  onNext: () => void;
  canGoNext: boolean;
}

export interface ReportHeaderProps {
  eyebrow: string;
  title: string;
  status?: ReactNode;
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
  stepper?: ReportStepper;
  exportActions?: ExportActions;
}

// Header shared by the report tabs: eyebrow, period title, status line, period
// stepper and Export on the first row, then the Monthly / Annual / AI switch.
export const ReportHeader: React.FC<ReportHeaderProps> = ({
  eyebrow,
  title,
  status,
  activeTab,
  onTabChange,
  stepper,
  exportActions,
}) => (
  <header className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <p className={eyebrowClass}>{eyebrow}</p>
        <h2 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[32px]">{title}</h2>
        {status && <p className="mt-1 text-sm text-grey-mid">{status}</p>}
      </div>
      {(stepper || exportActions) && (
        <div className="flex items-center gap-2">
          {stepper && (
            <div className="inline-flex h-10 items-center overflow-hidden rounded-xl border border-ledger bg-white">
              <button
                type="button"
                aria-label="Previous period"
                onClick={stepper.onPrevious}
                className="flex h-full w-10 items-center justify-center text-grey-dark transition-colors hover:bg-grey-light"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next period"
                disabled={!stepper.canGoNext}
                onClick={stepper.onNext}
                className="flex h-full w-10 items-center justify-center border-l border-ledger text-grey-dark transition-colors hover:bg-grey-light disabled:opacity-35"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {exportActions && <ExportMenu actions={exportActions} />}
        </div>
      )}
    </div>
    <Segmented
      options={TAB_OPTIONS}
      value={TAB_LABELS[activeTab]}
      label="Report type"
      onChange={(label) => onTabChange(TAB_ORDER.find((tab) => TAB_LABELS[tab] === label) ?? activeTab)}
    />
  </header>
);
