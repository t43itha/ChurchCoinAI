import * as XLSX from 'xlsx';
import { MonthlyReportData, AnnualReportData, ChurchDetails, CategoryGroup, LoanReportRow } from '../types';
import type { TransferSummary } from '../lib/reportableTransactions';
import type { ProgrammeIncome } from '../lib/programmeIncome';
import type { FundStatement, GiverSummary, GivingByDonor, TrendPoint } from '../lib/reportSummary';
import { sumMoney } from '../convex/lib/money';
import { isGiftAidEnabled } from '../lib/giftAid';
import { fundCellValues, formatPercentChange, formatUkDate, priorTotalFor, splitFundRows } from './reportFormatting';

type SheetCell = string | number;
type SheetRows = SheetCell[][];

const CURRENCY_FORMAT = '£#,##0.00';

export const transfersSheetRows = (transfers: TransferSummary): SheetRows => {
  const { funds, unmatched } = transfers;
  const rows: SheetRows = [["Fund", "Money in", "Money out", "Net"]];
  funds.forEach((fund) => rows.push([fund.fund, fund.in, fund.out, fund.net]));
  rows.push([
    "Total",
    sumMoney(funds, (fund) => fund.in),
    sumMoney(funds, (fund) => fund.out),
    sumMoney(funds, (fund) => fund.net),
  ]);
  if (unmatched !== 0) rows.push(["Unmatched", "", "", unmatched]);
  return rows;
};

export const loansSheetRows = (loans: LoanReportRow[]): SheetRows => {
  const rows: SheetRows = [["Lender", "Borrowed", "Repaid", "Outstanding", "Due"]];
  loans.forEach((loan) => rows.push([loan.lender, loan.borrowed, loan.repaid, loan.outstanding, loan.dueDate ?? ""]));
  rows.push([
    "Total",
    sumMoney(loans, (loan) => loan.borrowed),
    sumMoney(loans, (loan) => loan.repaid),
    sumMoney(loans, (loan) => loan.outstanding),
    "",
  ]);
  return rows;
};

export const programmeIncomeSheetRows = (programmes: ProgrammeIncome[]): SheetRows => {
  const rows: SheetRows = [["Programme", "Entries", "Amount"]];
  programmes.forEach((programme) => rows.push([programme.name, programme.count, programme.total]));
  rows.push(["Total", "", sumMoney(programmes, (programme) => programme.total)]);
  return rows;
};

// Receipts or payments by main category, largest first, with subcategories.
// With a comparison, adds the comparison period's value and a change column.
export const categorySheetRows = (opts: {
  title: string;
  currentLabel: string;
  groups: CategoryGroup[];
  total: number;
  totalLabel: string;
  comparison: { label: string; groups: CategoryGroup[]; total: number } | null;
}): SheetRows => {
  const { comparison } = opts;
  const header: SheetCell[] = ["Main Category", "Subcategory", opts.currentLabel];
  if (comparison) header.push(comparison.label, "Change");
  const rows: SheetRows = [[opts.title], [""], header];

  opts.groups.forEach((group) => {
    const prior = comparison ? priorTotalFor(comparison.groups, group.mainCategory) : 0;
    rows.push([
      group.mainCategory,
      "",
      group.total,
      ...(comparison ? [prior, formatPercentChange(group.total, prior)] : []),
    ]);
    group.subcategories.forEach((sub) => {
      rows.push(["", sub.name, sub.total, ...(comparison ? ["", ""] : [])]);
    });
  });

  rows.push(new Array<SheetCell>(header.length).fill(""));
  rows.push([
    opts.totalLabel,
    "",
    opts.total,
    ...(comparison ? [comparison.total, formatPercentChange(opts.total, comparison.total)] : []),
  ]);
  return rows;
};

// Fund statement grouped as unrestricted then restricted, with a subtotal for
// each group and an all-funds total. The Other column is only included when a
// fund has an other movement.
export const fundStatementSheetRows = (statement: FundStatement): SheetRows => {
  const { unrestricted, restricted, showOther } = splitFundRows(statement);
  const rows: SheetRows = [
    ["Fund", "Opening", "Income", "Spending", "Transfers", ...(showOther ? ["Other"] : []), "Closing"],
  ];
  unrestricted.forEach((row) => rows.push([row.fund, ...fundCellValues(row, showOther)]));
  rows.push(["Subtotal: unrestricted funds", ...fundCellValues(statement.unrestricted, showOther)]);
  restricted.forEach((row) => rows.push([row.fund, ...fundCellValues(row, showOther)]));
  rows.push(["Subtotal: restricted funds", ...fundCellValues(statement.restricted, showOther)]);
  rows.push(["All funds", ...fundCellValues(statement.total, showOther)]);
  return rows;
};

// Twelve-month trend with a total. The last year column is blank when no
// prior-year figures were supplied.
export const trendSheetRows = (trend: TrendPoint[]): SheetRows => {
  const hasPrior = trend.some((month) => month.priorIncome !== undefined);
  const rows: SheetRows = [["Month", "Income", "Spending", "Net", "Last year income"]];
  trend.forEach((month) => {
    rows.push([
      `${month.label}${month.isPartial ? " (part)" : ""}`,
      month.income,
      month.expenditure,
      month.net,
      month.priorIncome ?? "",
    ]);
  });
  rows.push(["", "", "", "", ""]);
  rows.push([
    "Total",
    sumMoney(trend, (month) => month.income),
    sumMoney(trend, (month) => month.expenditure),
    sumMoney(trend, (month) => month.net),
    hasPrior ? sumMoney(trend, (month) => month.priorIncome ?? 0) : "",
  ]);
  return rows;
};

// One row per giver, then a total. The Gift Aid column is only included when
// Gift Aid is enabled for the church.
export const tithesSheetRows = (titheGivers: GivingByDonor, giftAidEnabled: boolean): SheetRows => {
  const rows: SheetRows = [
    ["Tithes by Giver"],
    [""],
    giftAidEnabled ? ["Giver", "Gifts", "Gift Aid Eligible", "Amount"] : ["Giver", "Gifts", "Amount"],
  ];
  titheGivers.givers.forEach((giver: GiverSummary) => {
    rows.push(
      giftAidEnabled
        ? [giver.donor, giver.gifts, giver.giftAidEligible ? "Yes" : "No", giver.total]
        : [giver.donor, giver.gifts, giver.total]
    );
  });
  rows.push(giftAidEnabled ? ["", "", "", ""] : ["", "", ""]);
  const total = sumMoney(titheGivers.givers, (giver) => giver.total);
  rows.push(
    giftAidEnabled
      ? ["Total", titheGivers.giftCount, "", total]
      : ["Total", titheGivers.giftCount, total]
  );
  return rows;
};

type SummaryLine = { label: string; value: SheetCell; money?: boolean };

// A Summary sheet: title lines, then label/value rows. Money values get the
// currency format.
const summarySheet = (heading: string[], lines: SummaryLine[], extraRows: SheetRows = []) => {
  const rows: SheetRows = [
    ...heading.map((line) => [line]),
    [""],
    ["Summary"],
    ...lines.map((line) => [line.label, line.value]),
    ...extraRows,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const firstLine = heading.length + 2;
  lines.forEach((line, index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: firstLine + index, c: 1 })];
    if (line.money && cell) cell.z = CURRENCY_FORMAT;
  });
  return sheet;
};

const appendTransfersAndLoans = (
  workbook: XLSX.WorkBook,
  transfers: TransferSummary,
  loans: LoanReportRow[]
) => {
  if (transfers.funds.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(transfersSheetRows(transfers)), 'Transfers');
  }
  if (loans.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(loansSheetRows(loans)), 'Loans');
  }
};

const appendProgrammeIncome = (workbook: XLSX.WorkBook, programmes: ProgrammeIncome[]) => {
  if (programmes.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(programmeIncomeSheetRows(programmes)), 'Programmes');
  }
};

const toBlob = (workbook: XLSX.WorkBook) => {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

// Generate Monthly Report Excel workbook
export const generateMonthlyReportXLSX = async (
  reportData: MonthlyReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[] = []
): Promise<Blob> => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const workbook = XLSX.utils.book_new();
  const { previousMonth } = reportData.comparison;
  const { totals, fundStatement } = reportData;

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet(
      ['RCI Missions Monthly Report', churchDetails.name, reportData.period.label],
      [
        { label: 'Gross Income', value: totals.grossIncome, money: true },
        { label: 'Total Expenditure', value: totals.totalExpenditure, money: true },
        { label: 'Net Bankable', value: totals.netBankable, money: true },
        { label: 'Held across funds', value: fundStatement.total.closing, money: true },
        ...(giftAidEnabled
          ? [
              { label: 'Gift Aid Eligible', value: reportData.giftAidSummary.eligible, money: true },
              { label: 'Gift Aid Claimable', value: reportData.giftAidSummary.claimable, money: true },
            ]
          : []),
      ]
    ),
    'Summary'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      categorySheetRows({
        title: 'Receipts (Income)',
        currentLabel: 'Amount',
        groups: reportData.receipts,
        total: totals.grossIncome,
        totalLabel: 'Total',
        comparison: { label: previousMonth.label, groups: previousMonth.receipts, total: previousMonth.totals.income },
      })
    ),
    'Receipts'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      categorySheetRows({
        title: 'Payments (Expenditure)',
        currentLabel: 'Amount',
        groups: reportData.payments,
        total: totals.totalExpenditure,
        totalLabel: 'Total',
        comparison: { label: previousMonth.label, groups: previousMonth.payments, total: previousMonth.totals.expenditure },
      })
    ),
    'Payments'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(fundPositionRows(fundStatement, 'Fund position')),
    'Fund position'
  );

  // Weekly Breakdown Sheet
  const weeklyData: SheetRows = [
    ['Weekly Summary'],
    [''],
    ['Week Ending', 'Receipts', 'Payments', 'Net'],
  ];
  reportData.weeklyBreakdown.forEach(week => {
    weeklyData.push([
      week.weekEnding,
      week.receiptsTotal,
      week.paymentsTotal,
      week.receiptsTotal - week.paymentsTotal,
    ]);
  });
  weeklyData.push(['', '', '', '']);
  weeklyData.push([
    'Total',
    totals.grossIncome,
    totals.totalExpenditure,
    totals.netBankable,
  ]);

  const weeklySheet = XLSX.utils.aoa_to_sheet(weeklyData);
  XLSX.utils.book_append_sheet(workbook, weeklySheet, 'Weekly');

  // Mission Tithe Sheet
  const missionTitheData: SheetRows = [
    ['Mission Tithe (10% of General Fund Donations)'],
    [''],
    ['Week Ending', 'Total'],
  ];
  reportData.missionTithe.weeklyBreakdown.forEach(week => {
    missionTitheData.push([week.weekEnding, week.total]);
  });
  missionTitheData.push(['', '']);
  missionTitheData.push(['Total', reportData.missionTithe.total]);
  missionTitheData.push(['Mission Tithe to Pay', reportData.missionTithe.titheToPay]);

  const missionTitheSheet = XLSX.utils.aoa_to_sheet(missionTitheData);
  XLSX.utils.book_append_sheet(workbook, missionTitheSheet, 'Mission Tithe');

  if (reportData.titheGivers.givers.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(tithesSheetRows(reportData.titheGivers, giftAidEnabled)),
      'Tithes'
    );
  }

  appendTransfersAndLoans(workbook, reportData.transfers, reportData.loans);
  appendProgrammeIncome(workbook, programmeIncome);

  return toBlob(workbook);
};

// Fund statement with a title row, for a sheet of its own.
function fundPositionRows(statement: FundStatement, title: string): SheetRows {
  return [[title], [''], ...fundStatementSheetRows(statement)];
}

// Generate Annual Report Excel workbook
export const generateAnnualReportXLSX = async (
  reportData: AnnualReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[] = []
): Promise<Blob> => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const workbook = XLSX.utils.book_new();
  const { period, prior, totals, reserveCover: reserve, giving, missionTithe } = reportData;

  const headingLines = [
    'RCI Missions Annual Report',
    churchDetails.name,
    `Financial year: ${period.label}`,
  ];
  if (!period.isComplete) {
    headingLines.push(`In progress: ${formatUkDate(period.startDate)} – ${formatUkDate(period.throughDate)}`);
  }

  const comparisonRows: SheetRows = prior
    ? [
        [''],
        ['Comparison'],
        ['', prior.label, period.label, 'Change'],
        ['Income', prior.totals.income, totals.totalIncome, formatPercentChange(totals.totalIncome, prior.totals.income)],
        ['Spending', prior.totals.expenditure, totals.totalExpenditure, formatPercentChange(totals.totalExpenditure, prior.totals.expenditure)],
        ['Surplus / Deficit', prior.totals.net, totals.netMovement, '—'],
      ]
    : [];

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet(
      headingLines,
      [
        { label: 'Total Income', value: totals.totalIncome, money: true },
        { label: 'Total Expenditure', value: totals.totalExpenditure, money: true },
        { label: 'Surplus / Deficit', value: totals.netMovement, money: true },
        { label: 'Reserve cover', value: reserve.months === null ? '—' : `${reserve.months.toFixed(1)} months` },
        ...(giftAidEnabled
          ? [
              { label: 'Gift Aid Eligible', value: reportData.giftAidAnnual.totalEligible, money: true },
              { label: 'Gift Aid Claimable', value: reportData.giftAidAnnual.totalClaimable, money: true },
            ]
          : []),
        { label: 'Income eligible for mission tithe', value: missionTithe.eligible, money: true },
        { label: 'Mission tithe due (10%)', value: missionTithe.due, money: true },
        { label: 'Givers', value: giving.donorCount },
        { label: 'Regular givers', value: giving.regularGivers },
        { label: 'Gifts', value: giving.giftCount },
      ],
      comparisonRows
    ),
    'Summary'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      categorySheetRows({
        title: 'Income Breakdown',
        currentLabel: period.label,
        groups: reportData.receipts,
        total: totals.totalIncome,
        totalLabel: 'Total Income',
        comparison: prior ? { label: prior.label, groups: prior.receipts, total: prior.totals.income } : null,
      })
    ),
    'Income'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      categorySheetRows({
        title: 'Expenditure Breakdown',
        currentLabel: period.label,
        groups: reportData.payments,
        total: totals.totalExpenditure,
        totalLabel: 'Total Expenditure',
        comparison: prior ? { label: prior.label, groups: prior.payments, total: prior.totals.expenditure } : null,
      })
    ),
    'Expenditure'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(trendSheetRows(reportData.monthlyTrend.filter((month) => !month.isFuture))),
    'Trend'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(fundPositionRows(reportData.fundStatement, 'Statement of funds')),
    'Statement of funds'
  );

  appendTransfersAndLoans(workbook, reportData.transfers, reportData.loans);
  appendProgrammeIncome(workbook, programmeIncome);

  return toBlob(workbook);
};
