import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { ChurchDetails, Transaction } from "../../types";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import { isGiftAidEnabled } from "../../lib/giftAid";
import { incomeByProgramme } from "../../lib/programmeIncome";
import { buildHeadline, pickMover } from "../../lib/reportHeadline";
import { isWithinRange, monthPeriod } from "../../lib/reportPeriods";
import { percentChange, rankCategoryGroups } from "../../lib/reportSummary";
import { ReceiptRow } from "../wizard/Receipt";
import { ActionList, type ActionItem } from "./ActionList";
import { sectionCard, sectionHead, sectionTitle } from "./classes";
import { ComparisonToggle } from "./ComparisonToggle";
import { DetailGroup, DetailSection } from "./DetailSection";
import { exportMonthlyExcel, exportMonthlyPdf, useReportExport } from "./exportReport";
import { FundStatementTable } from "./FundStatementTable";
import { GiversTable } from "./GiversTable";
import { ChangeLine, KpiCard } from "./KpiCard";
import { formatCurrency, formatCurrencyWhole, formatShortDate, formatSignedCurrency, READY_THRESHOLD } from "./format";
import { LoansCard } from "./LoansCard";
import { MissionTitheTable } from "./MissionTitheTable";
import { INCOME_SERIES, SPENDING_SERIES } from "./palette";
import { ProgrammeIncomeTable } from "./ProgrammeIncomeTable";
import { RankedBreakdown } from "./RankedBreakdown";
import { ReadinessLine, ReportHeader, type ReportTab } from "./ReportHeader";
import { ReportHero } from "./ReportHero";
import { ReportReceiptColumn } from "./ReportReceiptColumn";
import { TransfersBetweenFunds } from "./TransfersBetweenFunds";
import { WeeklyChart } from "./WeeklyChart";

export interface MonthlyReportProps {
  transactions: Transaction[];
  programmes: Array<{ _id: string; name: string }>;
  churchDetails: ChurchDetails;
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
}

type CompareWith = "previous" | "lastYear";

// "Sep 2025" from "September 2025".
const shortLabel = (label: string) => label.replace(/^([A-Za-z]{3})[A-Za-z]*/, "$1");

// Monthly accounts: verdict, numbers with context, what to action, where the
// money came from and went, the fund position, then detail on demand.
const MonthlyReport: React.FC<MonthlyReportProps> = ({
  transactions,
  programmes,
  churchDetails,
  activeTab,
  onTabChange,
}) => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const [today] = useState(() => formatLocalDateInputValue(new Date()));
  const [selected, setSelected] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));
  const [compareWith, setCompareWith] = useState<CompareWith>("previous");
  const { busy, run } = useReportExport();
  const { year, month } = selected;

  const period = useMemo(() => monthPeriod(year, month, today), [year, month, today]);
  const reportData = useQuery(api.queries.reports.monthlyReportData, { year, month, today });
  const programmeIncome = useMemo(
    () =>
      incomeByProgramme(
        transactions.filter((transaction) => isWithinRange(transaction.date, period)),
        programmes
      ),
    [transactions, programmes, period]
  );

  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7)) - 1;
  const canGoNext = year < currentYear || (year === currentYear && month < currentMonth);
  const shiftMonth = (delta: number) =>
    setSelected(({ year: y, month: m }) => {
      const index = y * 12 + m + delta;
      return { year: Math.floor(index / 12), month: index % 12 };
    });

  const header = (
    <ReportHeader
      eyebrow={`${churchDetails.name} · Monthly accounts`}
      title={period.label}
      status={reportData && <ReadinessLine readiness={reportData.readiness} />}
      activeTab={activeTab}
      onTabChange={onTabChange}
      stepper={{ onPrevious: () => shiftMonth(-1), onNext: () => shiftMonth(1), canGoNext }}
      exportActions={
        reportData && {
          busy: busy !== null,
          onPdf: () => run("pdf", () => exportMonthlyPdf(reportData, churchDetails, programmeIncome)),
          onExcel: () => run("excel", () => exportMonthlyExcel(reportData, churchDetails, programmeIncome)),
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
          <p className="text-sm text-grey-mid">Loading monthly report...</p>
        </section>
      </div>
    );
  }

  const { totals, comparison, receipts, payments, weeklyBreakdown, missionTithe, titheGivers, giftAidSummary } =
    reportData;
  const { trend, yearToDate, fundStatement, readiness, transfers, loans } = reportData;
  const previous = comparison.previousMonth;
  const lastYear = comparison.sameMonthLastYear;
  const previousShort = previous.label.slice(0, 3);
  const previousName = previous.label.split(" ")[0];
  const lastYearShort = shortLabel(lastYear.label);
  const incomeVsPrevious = percentChange(totals.grossIncome, previous.totals.income);
  const incomeVsLastYear = percentChange(totals.grossIncome, lastYear.totals.income);
  const spendingVsPrevious = percentChange(totals.totalExpenditure, previous.totals.expenditure);
  const spendingVsLastYear = percentChange(totals.totalExpenditure, lastYear.totals.expenditure);

  const headline = buildHeadline({
    kind: "month",
    isComplete: reportData.period.isComplete,
    net: totals.netBankable,
    incomeChange: incomeVsPrevious,
    expenditureChange: spendingVsPrevious,
    comparisonLabel: previousName,
    incomeMover: pickMover(rankCategoryGroups(receipts, previous.receipts)),
    expenditureMover: pickMover(rankCategoryGroups(payments, previous.payments)),
    missionTitheDue: missionTithe.titheToPay,
    giftAidClaimable: giftAidEnabled ? giftAidSummary.claimable : undefined,
  });

  const actions: ActionItem[] = [];
  if (missionTithe.titheToPay > 0) {
    actions.push({
      id: "mission-tithe",
      tone: "pay",
      title: "Pay mission tithe",
      detail: "10% of general fund giving",
      amount: formatCurrency(missionTithe.titheToPay),
    });
  }
  if (giftAidEnabled && giftAidSummary.claimable > 0) {
    actions.push({
      id: "gift-aid",
      tone: "claim",
      title: "Claim Gift Aid",
      detail: `${formatCurrency(giftAidSummary.eligible)} eligible`,
      amount: formatCurrency(giftAidSummary.claimable),
    });
  }
  for (const loan of loans) {
    if (loan.outstanding <= 0) continue;
    actions.push({
      id: `loan-${loan.lender}`,
      tone: "pay",
      title: `${loan.lender} loan`,
      detail: `${formatCurrency(loan.outstanding)} outstanding${loan.dueDate ? ` · due ${formatShortDate(loan.dueDate)}` : ""}`,
    });
  }
  if (transfers.unmatched !== 0) {
    actions.push({
      id: "transfer",
      tone: "warn",
      title: "A transfer is missing its other side",
      detail: `${formatCurrency(Math.abs(transfers.unmatched))} with no matching leg`,
      href: "/transactions",
      linkLabel: "Fix",
    });
  }
  if (readiness.categorisedPercent !== null && readiness.categorisedPercent < READY_THRESHOLD) {
    actions.push({
      id: "categorise",
      tone: "info",
      title: `${readiness.categorisedPercent}% categorised`,
      detail: "Categorise the rest so these totals are complete",
      href: "/transactions",
      linkLabel: "Open",
    });
  }

  const trendLabels = trend.map((point) => point.label);
  const compared = compareWith === "previous" ? previous : lastYear;
  const receiptRows = rankCategoryGroups(receipts, compared.receipts);
  const paymentRows = rankCategoryGroups(payments, compared.payments);
  const fundAsAt = formatShortDate(reportData.period.throughDate);
  // Beside the verdict at xl; folds in under the hero below that.
  const receiptColumn = (
    <ReportReceiptColumn
      fundStatement={fundStatement}
      asAt={fundAsAt}
      readiness={readiness}
      extraTitle={giftAidEnabled ? "Gift Aid" : undefined}
      extra={
        giftAidEnabled ? <ReceiptRow label="Claimable from HMRC" value={formatCurrencyWhole(giftAidSummary.claimable)} /> : undefined
      }
    />
  );

  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-6">
          <ReportHero headline={headline} net={totals.netBankable} />

          <div className="xl:hidden">{receiptColumn}</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <KpiCard
              label="Income"
              value={formatCurrencyWhole(totals.grossIncome)}
              sparkline={{ values: trend.map((point) => point.income), color: INCOME_SERIES, labels: trendLabels }}
              lines={[
                <ChangeLine change={incomeVsPrevious} versus={`vs ${previousShort}`} polarity="income" />,
                <ChangeLine change={incomeVsLastYear} versus={`vs ${lastYearShort}`} polarity="income" />,
              ]}
            />
            <KpiCard
              label="Spending"
              value={formatCurrencyWhole(totals.totalExpenditure)}
              sparkline={{ values: trend.map((point) => point.expenditure), color: SPENDING_SERIES, labels: trendLabels }}
              lines={[
                <ChangeLine change={spendingVsPrevious} versus={`vs ${previousShort}`} polarity="spending" />,
                <ChangeLine change={spendingVsLastYear} versus={`vs ${lastYearShort}`} polarity="spending" />,
              ]}
            />
            <KpiCard
              label={totals.netBankable < 0 ? "Deficit" : "Surplus"}
              value={formatSignedCurrency(totals.netBankable)}
              valueTone={totals.netBankable < 0 ? "negative" : "default"}
              sparkline={{ values: trend.map((point) => point.net), color: INCOME_SERIES, labels: trendLabels, zeroLine: true }}
              lines={[
                `${previousShort} ${formatSignedCurrency(previous.totals.net)}`,
                `Year to date (${yearToDate.label}) ${formatSignedCurrency(yearToDate.totals.net)}`,
              ]}
            />
          </div>

          <ActionList items={actions} />

          <section className={sectionCard}>
            <div className={sectionHead}>
              <h3 className={sectionTitle}>Where it came from and went</h3>
              <ComparisonToggle
                ariaLabel="Compare with"
                options={[
                  { id: "previous", label: "Previous month" },
                  { id: "lastYear", label: "Same month last year" },
                ]}
                value={compareWith}
                onChange={(id) => setCompareWith(id === "lastYear" ? "lastYear" : "previous")}
              />
            </div>
            <div className="grid gap-6 border-t border-[#efeee9] p-[18px] md:grid-cols-2">
              <RankedBreakdown
                title="Income"
                side="income"
                total={totals.grossIncome}
                rows={receiptRows}
                comparisonLabel={`vs ${compared.label}`}
                emptyText="No income recorded for this month."
              />
              <RankedBreakdown
                title="Spending"
                side="spending"
                total={totals.totalExpenditure}
                rows={paymentRows}
                comparisonLabel={`vs ${compared.label}`}
                emptyText="No spending recorded for this month."
              />
            </div>
          </section>

          <section className={sectionCard}>
            <div className={sectionHead}>
              <h3 className={sectionTitle}>Fund position at {fundAsAt}</h3>
            </div>
            <div className="border-t border-[#efeee9]">
              <FundStatementTable
                statement={fundStatement}
                openingLabel={formatShortDate(reportData.period.startDate)}
                closingLabel={fundAsAt}
                showChange
              />
            </div>
          </section>

          <DetailGroup>
            <DetailSection title="Sunday by Sunday" summary={`${weeklyBreakdown.length} weeks`}>
              <div className="px-[18px] pt-3">
                <WeeklyChart weeks={weeklyBreakdown} monthEnd={reportData.period.endDate} />
              </div>
            </DetailSection>
            <DetailSection title="Tithes by giver" summary={`${titheGivers.donorCount} named givers`}>
              <GiversTable giving={titheGivers} giftAidEnabled={giftAidEnabled} />
            </DetailSection>
            {programmeIncome.length > 0 && (
              <DetailSection title="Income by programme">
                <ProgrammeIncomeTable rows={programmeIncome} />
              </DetailSection>
            )}
            <DetailSection title="Mission tithe workings" summary={`${formatCurrency(missionTithe.titheToPay)} to pay`}>
              <MissionTitheTable
                weeks={missionTithe.weeklyBreakdown}
                total={missionTithe.total}
                titheToPay={missionTithe.titheToPay}
              />
            </DetailSection>
            {transfers.funds.length > 0 && (
              <DetailSection title="Transfers between funds">
                <TransfersBetweenFunds transfers={transfers} embedded />
              </DetailSection>
            )}
            {loans.length > 0 && (
              <DetailSection title="Loans">
                <LoansCard loans={loans} embedded />
              </DetailSection>
            )}
          </DetailGroup>
        </div>

        <aside className="hidden xl:block">{receiptColumn}</aside>
      </div>
    </div>
  );
};

export { MonthlyReport };
