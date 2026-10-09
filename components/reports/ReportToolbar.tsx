import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { DataReadiness } from "../../lib/reportSummary";

export type ReportToolbarTab = "monthly" | "annual" | "ai";

const TABS: { id: ReportToolbarTab; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Annual" },
  { id: "ai", label: "AI reports" },
];

const READY_THRESHOLD = 95;

export interface ReportToolbarExport {
  onPdf: () => void;
  onExcel: () => void;
  busy: boolean;
}

export interface ReportToolbarProps {
  activeTab: ReportToolbarTab;
  onTabChange: (tab: ReportToolbarTab) => void;
  periodLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  readiness?: DataReadiness;
  inProgressLabel?: string;
  exportActions?: ReportToolbarExport;
}

const chipBase =
  "inline-flex items-center rounded-full border px-2.5 py-[3px] text-xs font-semibold";

const readinessText = (readiness: DataReadiness): string | null => {
  const parts: string[] = [];
  if (readiness.categorisedPercent !== null) parts.push(`${readiness.categorisedPercent}% categorised`);
  if (readiness.reconciledPercent !== null) parts.push(`${readiness.reconciledPercent}% reconciled`);
  return parts.length > 0 ? `Data ${parts.join(" · ")}` : null;
};

const isBelowReady = (readiness: DataReadiness): boolean =>
  (readiness.categorisedPercent !== null && readiness.categorisedPercent < READY_THRESHOLD) ||
  (readiness.reconciledPercent !== null && readiness.reconciledPercent < READY_THRESHOLD);

const ExportMenu: React.FC<{ exportActions: ReportToolbarExport }> = ({ exportActions }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={exportActions.busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink bg-ink px-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {exportActions.busy ? "Exporting…" : "Export"}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 min-w-[140px] overflow-hidden rounded-lg border border-ledger bg-white py-1 shadow-soft-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(exportActions.onPdf)}
            className="block w-full px-3.5 py-2 text-left text-sm text-ink hover:bg-grey-light"
          >
            PDF
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(exportActions.onExcel)}
            className="block w-full px-3.5 py-2 text-left text-sm text-ink hover:bg-grey-light"
          >
            Excel
          </button>
        </div>
      )}
    </div>
  );
};

export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  activeTab,
  onTabChange,
  periodLabel,
  onPrevious,
  onNext,
  canGoNext = true,
  canGoPrevious = true,
  readiness,
  inProgressLabel,
  exportActions,
}) => {
  const readinessLabel = readiness ? readinessText(readiness) : null;
  const readinessWarn = readiness ? isBelowReady(readiness) : false;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label="Report type" className="inline-flex rounded-lg border border-ledger bg-white p-0.5">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => onTabChange(tab.id)}
                className={`h-8 rounded-md px-3 text-sm font-semibold transition-colors ${
                  active ? "bg-ink text-white" : "text-grey-mid hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {periodLabel !== undefined && (
          <div className="inline-flex h-9 items-center rounded-lg border border-ledger bg-white">
            <button
              type="button"
              aria-label="Previous period"
              disabled={!canGoPrevious}
              onClick={onPrevious}
              className="flex h-full w-8 items-center justify-center text-grey-dark disabled:opacity-40"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="min-w-[8.5rem] px-1 text-center text-sm font-semibold text-ink">{periodLabel}</span>
            <button
              type="button"
              aria-label="Next period"
              disabled={!canGoNext}
              onClick={onNext}
              className="flex h-full w-8 items-center justify-center text-grey-dark disabled:opacity-40"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {readinessLabel && (
          <span
            className={`${chipBase} ${
              readinessWarn ? "border-[#f0e2d0] bg-amber-light text-amber" : "border-[#efeee9] bg-grey-light text-grey-mid"
            }`}
          >
            {readinessLabel}
          </span>
        )}

        {inProgressLabel && (
          <span className={`${chipBase} border-[#f0e2d0] bg-amber-light text-amber`}>{inProgressLabel}</span>
        )}
      </div>

      {exportActions && <ExportMenu exportActions={exportActions} />}
    </div>
  );
};
