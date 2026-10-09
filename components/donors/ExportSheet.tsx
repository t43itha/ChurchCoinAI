import type { Donor, Fund, Transaction } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { Segmented, btnOutline, btnSage, btnMd, fieldLabel, screenHelp, screenTitle, tickBox, tickRow } from "../wizard/ui";

export type ExportPeriod = "year" | "last6months" | "all";
export type ExportReport = { type: "all" | "tithes" | "campaign"; campaignId?: string };

const PERIODS: Array<{ label: string; key: ExportPeriod }> = [
  { label: "Year", key: "year" },
  { label: "Last 6 months", key: "last6months" },
  { label: "All", key: "all" },
];

export interface ExportSheetProps {
  donor: Donor;
  funds: Fund[];
  // Reportable income for this donor, used only to show which report options have gifts behind them.
  incomeTransactions: Transaction[];
  period: ExportPeriod;
  onPeriodChange: (period: ExportPeriod) => void;
  year: number;
  onYearChange: (year: number) => void;
  report: ExportReport;
  onReportChange: (report: ExportReport) => void;
  busy: boolean;
  onSavePdf: () => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onClose: () => void;
}

// A giving statement for one donor: pick the period and the funds, then save or send the PDF.
export default function ExportSheet({
  donor,
  funds,
  incomeTransactions,
  period,
  onPeriodChange,
  year,
  onYearChange,
  report,
  onReportChange,
  busy,
  onSavePdf,
  onWhatsApp,
  onEmail,
  onClose,
}: ExportSheetProps) {
  const unrestrictedIds = new Set(funds.filter((fund) => fund.type === "Unrestricted").map((fund) => fund._id));
  const hasTithes = incomeTransactions.some((transaction) => unrestrictedIds.has(transaction.fundId));
  const campaignFunds = funds.filter((fund) => fund.type === "Restricted");
  const years = [0, 1, 2].map((offset) => String(new Date().getFullYear() - offset));
  const hasContact = Boolean(donor.phone || donor.email);

  return (
    <WizardFrame
      ariaLabel={`Export for ${donor.name}`}
      title="Export statement"
      onClose={onClose}
      footer={
        <StepFooter>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              {donor.phone && (
                <button type="button" onClick={onWhatsApp} disabled={busy} className={`${btnSage} ${btnMd} flex-1`}>
                  WhatsApp
                </button>
              )}
              {donor.email && (
                <button type="button" onClick={onEmail} disabled={busy} className={`${btnOutline} ${btnMd} flex-1`}>
                  Email
                </button>
              )}
            </div>
            <button type="button" onClick={onSavePdf} disabled={busy} className={`${btnOutline} ${btnMd}`}>
              {busy ? "Generating…" : "Save PDF"}
            </button>
          </div>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>{donor.name}</h2>
      <p className={screenHelp}>Choose what the statement covers.</p>

      <span className={fieldLabel}>Period</span>
      <Segmented
        label="Period"
        options={PERIODS.map((option) => option.label)}
        value={PERIODS.find((option) => option.key === period)?.label ?? "Year"}
        onChange={(label) => onPeriodChange(PERIODS.find((option) => option.label === label)?.key ?? "year")}
      />

      {period === "year" && (
        <>
          <span className={fieldLabel}>Year</span>
          <Segmented
            label="Year"
            options={years}
            value={String(year)}
            onChange={(value) => onYearChange(Number(value))}
          />
        </>
      )}

      <span className={fieldLabel}>Report</span>
      <div className="grid gap-2" role="group" aria-label="Report">
        <ReportRow
          title="All schedules"
          detail={incomeTransactions.length > 0 ? "All funds" : undefined}
          on={report.type === "all"}
          onClick={() => onReportChange({ type: "all" })}
        />
        <ReportRow
          title="Tithes only"
          detail={hasTithes ? "Regular giving" : undefined}
          on={report.type === "tithes"}
          onClick={() => onReportChange({ type: "tithes" })}
        />
        {campaignFunds.map((fund) => (
          <ReportRow
            key={fund._id}
            title={fund.name}
            detail={incomeTransactions.some((transaction) => transaction.fundId === fund._id) ? "Campaign" : undefined}
            on={report.type === "campaign" && report.campaignId === fund._id}
            onClick={() => onReportChange({ type: "campaign", campaignId: fund._id })}
          />
        ))}
      </div>

      {!hasContact && (
        <p className="mt-4 rounded-2xl bg-amber-light px-3.5 py-2.5 text-sm text-amber">
          No contact info on file for sending.
        </p>
      )}
    </WizardFrame>
  );
}

function ReportRow({
  title,
  detail,
  on,
  onClick,
}: {
  title: string;
  detail?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
    >
      <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#d6d3cd]"}`} aria-hidden="true">
        {on ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
      {detail && <span className="shrink-0 text-xs text-grey-mid">{detail}</span>}
    </button>
  );
}
