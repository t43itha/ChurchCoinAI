import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { ChurchDetails, Transaction } from "../../types";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import { isGiftAidEnabled } from "../../lib/giftAid";
import { incomeByProgramme } from "../../lib/programmeIncome";
import { buildHeadline, pickMover } from "../../lib/reportHeadline";
import { financialYearPeriod, financialYearStartFor, isWithinRange } from "../../lib/reportPeriods";
import { percentChange, rankCategoryGroups } from "../../lib/reportSummary";
import { sectionCard, sectionHead, sectionTitle } from "./classes";
import { DetailGroup, DetailSection } from "./DetailSection";
import { exportAnnualExcel, exportAnnualPdf, useReportExport } from "./exportReport";
import { FactCard, type FactRow } from "./FactCard";
import { FundStatementTable } from "./FundStatementTable";
import { formatCurrency, formatCurrencyWhole, formatShortDate, formatSignedCurrency } from "./format";
import { AnnualTrendChart } from "./AnnualTrendChart";
import { ChangeLine, KpiCard } from "./KpiCard";
import { LoansCard } from "./LoansCard";
import { ProgrammeIncomeTable } from "./ProgrammeIncomeTable";
import { RankedBreakdown } from "./RankedBreakdown";
import { ReadinessLine, ReportHeader, type ReportTab } from "./ReportHeader";
import { ReportHero } from "./ReportHero";
import { ReportReceiptColumn } from "./ReportReceiptColumn";
import { TransfersBetweenFunds } from "./TransfersBetweenFunds";

export interface AnnualReportProps {
  transactions: Transaction[];
  programmes: Array<{ _id: string; name: string }>;
  churchDetails: ChurchDetails;
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
}

const monthsLabel = (months: number | null) => {
  if (months === null) return "—";
  return `${months} ${months === 1 ? "month" : "months"}`;
};

// The financial year: the organisation's reporting period, in progress until its
// last day. Stepping back is open; stepping forward stops at the current year.
const AnnualReport: React.FC<AnnualReportProps> = ({
  transactions,
  programmes,
  churchDetails,
  activeTab,
  onTabChange,
}) => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const reportingPeriod = churchDetails.reportingPeriod ?? "tax_year";
  const [today] = useState(() => formatLocalDateInputValue(new Date()));
  const currentStart = financialYearStartFor(today, reportingPeriod);
  const [startYear, setStartYear] = useState(currentStart);
  const { busy, run } = useReportExport();

  const period = useMemo(
    () => financialYearPeriod(startYear, reportingPeriod, today),
    [startYear, reportingPeriod, today]
  );
  const reportData = useQuery(api.queries.reports.annualReportData, { year: startYear, today });
  const programmeIncome = useMemo(
    () =>
      incomeByProgramme(
        transactions.filter((transaction) =>
          isWithinRange(transaction.date, { startDate: period.startDate, endDate: period.throughDate })
        ),
        programmes
      ),
    [transactions, programmes, period]
  );

  const title = reportingPeriod === "calendar_year" ? period.label : `Tax year ${period.label}`;
  const lead = period.isComplete
    ? undefined
    : `In progress · ${formatShortDate(period.startDate)} – ${formatShortDate(period.throughDate)} · ${period.monthsElapsed} of ${period.monthsTotal} months`;

  const header = (
    <ReportHeader
      eyebrow={`${churchDetails.name} · Annual accounts`}
      title={title}
      status={reportData && <ReadinessLine readiness={reportData.readiness} lead={lead} />}
      activeTab={activeTab}
      onTabChange={onTabChange}
      stepper={{
        onPrevious: () => setStartYear((year) => year - 1),
        onNext: () => setStartYear((year) => year + 1),
        canGoNext: startYear < currentStart,
      }}
      exportActions={
        reportData && {
          busy: busy !== null,
          onPdf: () => run("pdf", () => exportAnnualPdf(reportData, churchDetails, programmeIncome)),
          onExcel: () => run("excel", () => exportAnnualExcel(reportData, churchDetails, programmeIncome)),
        }
      }
    />
  );

  if (!reportData) {
    return (
      <div className="space-y-6">
        {header}
        <section className={`${sectionCard} flex min-h-[320px] flex-col items-center justify-center p-12`}>
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-transparent" />
          <p className="text-sm text-grey-mid">Loading annual report...</p>
        </section>
      </div>
    );
  }

  const { totals, prior, monthlyTrend, giftAidAnnual, missionTithe, giving, fundStatement } = reportData;
  const { reserveCover, readiness, transfers, loans, receipts, payments } = reportData;
  const isComplete = reportData.period.isComplete;
  const priorTotals = prior?.totals ?? null;
  const incomeChange = priorTotals ? percentChange(totals.totalIncome, priorTotals.income) : null;
  const expenditureChange = priorTotals ? percentChange(totals.totalExpenditure, priorTotals.expenditure) : null;
  // In progress, the fair comparison is the same months of last year.
  const comparedName = isComplete ? prior?.label ?? "last year" : "same months last year";
  const headlineComparison = isComplete ? comparedName : "the same months last year";
  const versus = `vs ${comparedName}`;
  const targetMet = reserveCover.months !== null && reserveCover.months >= reserveCover.targetMonths;

  const headline = buildHeadline({
    kind: "year",
    isComplete,
    net: totals.netMovement,
    incomeChange,
    expenditureChange,
    comparisonLabel: headlineComparison,
    incomeMover: prior ? pickMover(rankCategoryGroups(receipts, prior.receipts)) : undefined,
    expenditureMover: prior ? pickMover(rankCategoryGroups(payments, prior.payments)) : undefined,
    reserveCoverMonths: reserveCover.months,
  });

  const fundOpening = formatShortDate(reportData.period.startDate);
  const fundClosing = formatShortDate(reportData.period.throughDate);
  const receiptColumn = (
    <ReportReceiptColumn
      fundStatement={fundStatement}
      asAt={fundClosing}
      readiness={readiness}
    />
  );

  const giftAidRows: FactRow[] = [
    { label: "Eligible gifts", value: formatCurrency(giftAidAnnual.totalEligible) },
    { label: "Claimable from HMRC (25%)", value: formatCurrency(giftAidAnnual.totalClaimable), tone: "warning" },
  ];
  const givingRows: FactRow[] = [
    { label: "Givers", value: String(giving.donorCount) },
    { label: "Regular givers", value: String(giving.regularGivers) },
    { label: "Gifts", value: String(giving.giftCount) },
    { label: "Mission tithe due", value: formatCurrency(missionTithe.due), tone: "warning" },
  ];

  const hasDetail = programmeIncome.length > 0 || transfers.funds.length > 0;

  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-6">
          <ReportHero headline={headline} net={totals.netMovement} />

          <div className="xl:hidden">{receiptColumn}</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Income"
              value={formatCurrencyWhole(totals.totalIncome)}
              lines={[<ChangeLine change={incomeChange} versus={versus} polarity="income" />]}
            />
            <KpiCard
              label="Spending"
              value={formatCurrencyWhole(totals.totalExpenditure)}
              lines={[<ChangeLine change={expenditureChange} versus={versus} polarity="spending" />]}
            />
            <KpiCard
              label={totals.netMovement < 0 ? "Deficit" : "Surplus"}
              value={formatSignedCurrency(totals.netMovement)}
              valueTone={totals.netMovement < 0 ? "negative" : "default"}
              lines={[priorTotals ? `Same point last year ${formatSignedCurrency(priorTotals.net)}` : "No figures last year"]}
            />
            <KpiCard
              label="Reserve cover"
              value={monthsLabel(reserveCover.months)}
              lines={[
                <span className={targetMet ? "text-sage" : "text-amber"}>
                  Target {reserveCover.targetMonths} months
                </span>,
              ]}
            />
          </div>

          <section className={sectionCard}>
            <div className={sectionHead}>
              <h3 className={sectionTitle}>Month by month</h3>
            </div>
            <div className="border-t border-[#efeee9] p-[18px]">
              <AnnualTrendChart points={monthlyTrend} />
            </div>
          </section>

          <section className={sectionCard}>
            <div className={sectionHead}>
              <h3 className={sectionTitle}>Income and spending against last year</h3>
              <span className="text-xs text-grey-mid">
                {isComplete ? `vs ${comparedName}` : `Like-for-like · ${period.monthsElapsed} months`}
              </span>
            </div>
            <div className="grid gap-6 border-t border-[#efeee9] p-[18px] md:grid-cols-2">
              <RankedBreakdown
                title="Income"
                side="income"
                total={totals.totalIncome}
                rows={rankCategoryGroups(receipts, prior?.receipts)}
                emptyText="No income recorded for this year."
              />
              <RankedBreakdown
                title="Spending"
                side="spending"
                total={totals.totalExpenditure}
                rows={rankCategoryGroups(payments, prior?.payments)}
                emptyText="No spending recorded for this year."
              />
            </div>
          </section>

          <section className={sectionCard}>
            <div className={sectionHead}>
              <h3 className={sectionTitle}>Statement of funds</h3>
              <span className="text-xs text-grey-mid">
                {fundOpening} to {fundClosing}
              </span>
            </div>
            <div className="border-t border-[#efeee9]">
              <FundStatementTable
                statement={fundStatement}
                openingLabel={fundOpening}
                closingLabel={fundClosing}
                grouped
                showChange
              />
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            {giftAidEnabled && (
              <FactCard
                title="Gift Aid"
                rows={giftAidRows}
                note="Total potential Gift Aid claim for the year. Remember to submit claims within 4 years of the tax year in which donations were received."
              />
            )}
            <LoansCard loans={loans} />
            <FactCard
              title="Giving"
              rows={givingRows}
              note="Regular givers gave in at least half of the elapsed months."
            />
          </div>

          {hasDetail && (
            <DetailGroup>
              {programmeIncome.length > 0 && (
                <DetailSection title="Income by programme">
                  <ProgrammeIncomeTable rows={programmeIncome} />
                </DetailSection>
              )}
              {transfers.funds.length > 0 && (
                <DetailSection title="Transfers between funds">
                  <TransfersBetweenFunds transfers={transfers} embedded />
                </DetailSection>
              )}
            </DetailGroup>
          )}
        </div>

        <aside className="hidden xl:block">{receiptColumn}</aside>
      </div>
    </div>
  );
};

export { AnnualReport };
