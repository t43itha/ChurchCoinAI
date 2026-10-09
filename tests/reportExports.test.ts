import { describe, expect, it } from "vitest";
import type { AnnualReportData, CategoryGroup, LoanReportRow, MonthlyReportData } from "../types";
import type { DataReadiness, FundStatement, FundStatementRow, GivingByDonor, PeriodTotals } from "../lib/reportSummary";
import type { ReportPeriod } from "../lib/reportPeriods";
import {
  generateAnnualReportHTML,
  generateMonthlyReportHTML,
  loansSectionHTML,
} from "../services/pdfGenerator";
import { fundStatementSheetRows, categorySheetRows, tithesSheetRows } from "../services/excelGenerator";

const churchDetails = (giftAidEnabled: boolean) => ({
  name: "Test Church",
  charityNumber: "1234567",
  giftAidEnabled,
});

const fund = (row: Pick<FundStatementRow, "fund" | "type"> & Partial<FundStatementRow>): FundStatementRow => ({
  fundId: row.fund.toLowerCase().replace(/\s+/g, "-"),
  opening: 0,
  income: 0,
  expenditure: 0,
  transfers: 0,
  other: 0,
  closing: 0,
  ...row,
});

const sumOf = (rows: FundStatementRow[], pick: (row: FundStatementRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

const totalsOf = (rows: FundStatementRow[]) => ({
  opening: sumOf(rows, (row) => row.opening),
  income: sumOf(rows, (row) => row.income),
  expenditure: sumOf(rows, (row) => row.expenditure),
  transfers: sumOf(rows, (row) => row.transfers),
  other: sumOf(rows, (row) => row.other),
  closing: sumOf(rows, (row) => row.closing),
});

const statementOf = (rows: FundStatementRow[]): FundStatement => {
  const unrestricted = rows.filter((row) => row.type === "Unrestricted" || row.type === "Designated");
  const restricted = rows.filter((row) => row.type !== "Unrestricted" && row.type !== "Designated");
  return {
    rows,
    unrestricted: totalsOf(unrestricted),
    restricted: totalsOf(restricted),
    total: totalsOf(rows),
  };
};

// Balanced fund rows: closing = opening + income - expenditure + transfers + other.
const fundRows = (): FundStatementRow[] => [
  fund({ fund: "General Fund", type: "Unrestricted", opening: 1000, income: 500, expenditure: 300, transfers: -100, closing: 1100 }),
  fund({ fund: "Building Fund", type: "Designated", opening: 200, transfers: 100, closing: 300 }),
  fund({ fund: "Youth Fund", type: "Restricted", opening: 50, income: 20, closing: 70 }),
];

const totals = (income: number, expenditure: number): PeriodTotals => ({
  income,
  expenditure,
  net: income - expenditure,
});

const readiness: DataReadiness = { transactionCount: 0, categorisedPercent: null, reconciledPercent: null };
const noTransfers = { funds: [], unmatched: 0 };
const noGiving: GivingByDonor = { givers: [], donorCount: 0, giftCount: 0 };

const group = (mainCategory: string, total: number): CategoryGroup => ({
  mainCategory,
  subcategories: [{ name: `${mainCategory} general`, total }],
  total,
});

const period = (overrides: Partial<ReportPeriod> = {}): ReportPeriod => ({
  label: "2026/27",
  startDate: "2026-04-06",
  endDate: "2027-04-05",
  throughDate: "2026-10-08",
  isComplete: false,
  monthsElapsed: 7,
  monthsTotal: 12,
  ...overrides,
});

const annualReport = (overrides: Partial<AnnualReportData> = {}): AnnualReportData => ({
  year: 2026,
  reportingPeriod: "tax_year",
  period: period(),
  receipts: [group("Offerings", 800)],
  payments: [group("Ministry", 300)],
  monthlyTrend: [],
  prior: null,
  giftAidAnnual: { totalEligible: 400, totalClaimable: 100 },
  missionTithe: { eligible: 800, due: 80 },
  giving: { donorCount: 3, giftCount: 12, regularGivers: 2 },
  fundStatement: statementOf(fundRows()),
  reserveCover: { months: 1.6, unrestrictedBalance: 1400, averageMonthlyExpenditure: 875, targetMonths: 3 },
  readiness,
  totals: { totalIncome: 800, totalExpenditure: 300, netMovement: 500 },
  transfers: noTransfers,
  loans: [],
  ...overrides,
});

const monthlyReport = (overrides: Partial<MonthlyReportData> = {}): MonthlyReportData => {
  const previous = {
    label: "September 2026",
    range: { startDate: "2026-09-01", endDate: "2026-09-30" },
    totals: totals(400, 250),
    receipts: [group("Offerings", 400)],
    payments: [group("Ministry", 250)],
  };
  return {
    year: 2026,
    month: 9,
    monthName: "October 2026",
    period: period({ label: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31", throughDate: "2026-10-31", isComplete: true }),
    receipts: [group("Offerings", 500)],
    payments: [group("Ministry", 300)],
    weeklyBreakdown: [],
    missionTithe: { weeklyBreakdown: [], total: 0, titheToPay: 0 },
    tithes: [],
    titheGivers: noGiving,
    giftAidSummary: { eligible: 200, claimable: 50 },
    totals: { grossIncome: 500, totalExpenditure: 300, netBankable: 200 },
    comparison: {
      previousMonth: previous,
      sameMonthLastYear: { ...previous, label: "October 2025" },
    },
    trend: [],
    yearToDate: { label: "2026/27", totals: totals(500, 300) },
    fundStatement: statementOf(fundRows()),
    readiness,
    transfers: noTransfers,
    loans: [],
    ...overrides,
  };
};

describe("loansSectionHTML", () => {
  const loans: LoanReportRow[] = [
    { lender: "Bank <Ltd> & Co", dueDate: "2026-12-31", borrowed: 1852, repaid: 500, outstanding: 1352 },
  ];

  it("renders nothing when there are no loans", () => {
    expect(loansSectionHTML([])).toBe("");
  });

  it("escapes lender names and shows the outstanding balance", () => {
    const html = loansSectionHTML(loans);
    expect(html).toContain("Loans");
    expect(html).toContain("Bank &lt;Ltd&gt; &amp; Co");
    expect(html).not.toContain("Bank <Ltd>");
    expect(html).toContain("Outstanding");
    expect(html).toContain("£1352.00");
    expect(html).toContain("31 Dec 2026");
  });
});

describe("fund statement sheet", () => {
  it("groups funds with subtotals and an all-funds total, without an Other column when no fund has one", () => {
    expect(fundStatementSheetRows(statementOf(fundRows()))).toEqual([
      ["Fund", "Opening", "Income", "Spending", "Transfers", "Closing"],
      ["General Fund", 1000, 500, 300, -100, 1100],
      ["Building Fund", 200, 0, 0, 100, 300],
      ["Subtotal: unrestricted funds", 1200, 500, 300, 0, 1400],
      ["Youth Fund", 50, 20, 0, 0, 70],
      ["Subtotal: restricted funds", 50, 20, 0, 0, 70],
      ["All funds", 1250, 520, 300, 0, 1470],
    ]);
  });

  it("adds an Other column when a fund has an other movement", () => {
    const rows = [
      ...fundRows(),
      fund({ fund: "Loan Fund", type: "Restricted", other: 500, closing: 500 }),
    ];
    const sheet = fundStatementSheetRows(statementOf(rows));
    expect(sheet[0]).toEqual(["Fund", "Opening", "Income", "Spending", "Transfers", "Other", "Closing"]);
    expect(sheet.find((row) => row[0] === "Loan Fund")).toEqual(["Loan Fund", 0, 0, 0, 0, 500, 500]);
    expect(sheet.at(-1)).toEqual(["All funds", 1250, 520, 300, 0, 500, 1970]);
  });
});

describe("category sheet and tithes sheet", () => {
  it("adds prior and change columns only when a comparison is given", () => {
    const rows = categorySheetRows({
      title: "Income",
      currentLabel: "2026/27",
      groups: [group("Offerings", 800), group("Missions", 50)],
      total: 850,
      totalLabel: "Total Income",
      comparison: { label: "2025/26", groups: [group("Offerings", 600)], total: 600 },
    });
    expect(rows[2]).toEqual(["Main Category", "Subcategory", "2026/27", "2025/26", "Change"]);
    expect(rows[3]).toEqual(["Offerings", "", 800, 600, "+33.3%"]);
    expect(rows.find((row) => row[0] === "Missions")).toEqual(["Missions", "", 50, 0, "—"]);
  });

  it("omits the Gift Aid column when Gift Aid is disabled", () => {
    const givers: GivingByDonor = {
      givers: [{ donor: "Alex", gifts: 2, total: 150, giftAidEligible: true }],
      donorCount: 1,
      giftCount: 2,
    };
    expect(tithesSheetRows(givers, false)[2]).toEqual(["Giver", "Gifts", "Amount"]);
    expect(tithesSheetRows(givers, true)[2]).toEqual(["Giver", "Gifts", "Gift Aid Eligible", "Amount"]);
  });
});

describe("monthly report PDF", () => {
  it("shows the Gift Aid summary only when Gift Aid is enabled", () => {
    expect(generateMonthlyReportHTML(monthlyReport(), churchDetails(true))).toContain("Gift Aid Summary");
    expect(generateMonthlyReportHTML(monthlyReport(), churchDetails(false))).not.toContain("Gift Aid");
  });

  it("includes the loans section when there are loans", () => {
    const html = generateMonthlyReportHTML(
      monthlyReport({ loans: [{ lender: "Alex", borrowed: 1000, repaid: 0, outstanding: 1000 }] }),
      churchDetails(true)
    );
    expect(html).toContain("<div class=\"section-title\">Loans</div>");
    expect(generateMonthlyReportHTML(monthlyReport(), churchDetails(true))).not.toContain("Loans</div>");
  });
});

describe("annual report PDF", () => {
  it("says the period is in progress with its dates when it is not complete", () => {
    expect(generateAnnualReportHTML(annualReport(), churchDetails(true))).toContain(
      "In progress: 6 Apr 2026 – 8 Oct 2026"
    );
  });

  it("omits the in-progress line once the period is complete", () => {
    const html = generateAnnualReportHTML(
      annualReport({ period: period({ isComplete: true, throughDate: "2027-04-05" }) }),
      churchDetails(true)
    );
    expect(html).not.toContain("In progress");
  });

  it("omits the comparison section when there is no prior period", () => {
    expect(generateAnnualReportHTML(annualReport({ prior: null }), churchDetails(true))).not.toContain(
      "Comparison with"
    );
  });

  it("includes the comparison section and prior label when a prior period is given", () => {
    const html = generateAnnualReportHTML(
      annualReport({
        prior: {
          label: "2025/26",
          range: { startDate: "2025-04-06", endDate: "2026-10-08" },
          totals: totals(600, 400),
          receipts: [group("Offerings", 600)],
          payments: [group("Ministry", 400)],
        },
      }),
      churchDetails(true)
    );
    expect(html).toContain("Comparison with 2025/26");
    expect(html).toContain("+33.3%");
  });

  it("omits Gift Aid sections when Gift Aid is disabled", () => {
    const html = generateAnnualReportHTML(annualReport(), churchDetails(false));
    expect(html).not.toContain("Gift Aid");
    expect(html).toContain("Reserve cover");
    expect(html).toContain("1.6 months");
  });
});
