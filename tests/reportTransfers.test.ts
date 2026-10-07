import { describe, expect, it } from "vitest";
import { buildTransferSummary } from "../lib/reportableTransactions";
import { transfersSectionHTML } from "../services/pdfGenerator";
import { loansSheetRows, transfersSheetRows } from "../services/excelGenerator";
import { loanReportRows, type MovementLeg } from "../lib/movementMatching";

const funds = [
  { _id: "general", name: "General Fund" },
  { _id: "building", name: "Building <Fund>" },
];

const leg = (fundId: string, type: "Income" | "Expenditure", amount: number) => ({
  fundId,
  type,
  amount,
  movementKind: "transfer" as const,
});

describe("transfers between funds on reports", () => {
  it("names each fund and sorts by name", () => {
    expect(
      buildTransferSummary(
        [leg("general", "Expenditure", 300), leg("building", "Income", 300), { fundId: "general", type: "Income" as const, amount: 50 }],
        funds
      )
    ).toEqual({
      funds: [
        { fundId: "building", fund: "Building <Fund>", in: 300, out: 0, net: 300 },
        { fundId: "general", fund: "General Fund", in: 0, out: 300, net: -300 },
      ],
      unmatched: 0,
    });
  });

  it("renders no PDF section when nothing moved between funds", () => {
    expect(transfersSectionHTML({ funds: [], unmatched: 0 })).toBe("");
  });

  it("renders each fund, a total, and escapes fund names", () => {
    const html = transfersSectionHTML(buildTransferSummary([leg("general", "Expenditure", 300), leg("building", "Income", 300)], funds));
    expect(html).toContain("Transfers between funds");
    expect(html).toContain("Building &lt;Fund&gt;");
    expect(html).not.toContain("Building <Fund>");
    expect(html).toContain("Total");
    expect(html).not.toContain("Unmatched");
  });

  it("shows the unmatched difference when a transfer has one side", () => {
    const html = transfersSectionHTML(buildTransferSummary([leg("general", "Expenditure", 300)], funds));
    expect(html).toContain("Unmatched");
  });
});

describe("transfers sheet", () => {
  it("lists each fund with a total, and no unmatched row when the transfers balance", () => {
    const summary = buildTransferSummary([leg("general", "Expenditure", 300), leg("building", "Income", 300)], funds);
    expect(transfersSheetRows(summary)).toEqual([
      ["Fund", "Money in", "Money out", "Net"],
      ["Building <Fund>", 300, 0, 300],
      ["General Fund", 0, 300, -300],
      ["Total", 300, 300, 0],
    ]);
  });

  it("adds an unmatched row when one side is missing", () => {
    const summary = buildTransferSummary([leg("general", "Expenditure", 300)], funds);
    expect(transfersSheetRows(summary)).toEqual([
      ["Fund", "Money in", "Money out", "Net"],
      ["General Fund", 0, 300, -300],
      ["Total", 0, 300, -300],
      ["Unmatched", "", "", -300],
    ]);
  });
});

describe("loans sheet", () => {
  it("lists each loan with a total", () => {
    expect(
      loansSheetRows([
        { lender: "Alex Sackey", dueDate: "2026-12-31", borrowed: 1852, repaid: 500, outstanding: 1352 },
        { lender: "Bank", borrowed: 1000, repaid: 1000, outstanding: 0 },
      ])
    ).toEqual([
      ["Lender", "Borrowed", "Repaid", "Outstanding", "Due"],
      ["Alex Sackey", 1852, 500, 1352, "2026-12-31"],
      ["Bank", 1000, 1000, 0, ""],
      ["Total", 2852, 1500, 1352, ""],
    ]);
  });
});

describe("loan rows on reports", () => {
  const loanLeg = (
    id: string,
    type: "Income" | "Expenditure",
    amount: number,
    date: string,
    extra: Partial<MovementLeg> = {}
  ): MovementLeg => ({ _id: id, type, amount, date, fundId: "general", movementKind: "loan", ...extra });

  it("counts only repayments dated on or before the period end", () => {
    const rows = loanReportRows(
      [
        {
          lender: "Alex Sackey",
          dueDate: "2026-12-31",
          legs: [loanLeg("in", "Income", 1000, "2026-08-03"), loanLeg("late", "Expenditure", 400, "2026-10-20")],
        },
      ],
      "2026-09-30"
    );
    expect(rows).toEqual([
      { lender: "Alex Sackey", dueDate: "2026-12-31", borrowed: 1000, repaid: 0, outstanding: 1000 },
    ]);
  });

  it("drops a loan whose only leg is after the period end", () => {
    expect(
      loanReportRows([{ lender: "Alex", legs: [loanLeg("in", "Income", 1000, "2026-10-02")] }], "2026-09-30")
    ).toEqual([]);
  });

  it("ignores voided legs, and drops a loan with only voided legs", () => {
    const rows = loanReportRows(
      [
        {
          lender: "Alex",
          legs: [
            loanLeg("in", "Income", 1000, "2026-08-03"),
            loanLeg("void", "Expenditure", 400, "2026-08-10", { isVoided: true }),
          ],
        },
        { lender: "Voided", legs: [loanLeg("gone", "Income", 50, "2026-08-03", { isVoided: true })] },
      ],
      "2026-09-30"
    );
    expect(rows).toEqual([{ lender: "Alex", borrowed: 1000, repaid: 0, outstanding: 1000 }]);
  });

  it("sorts by lender, with a missing lender as an empty name", () => {
    const rows = loanReportRows(
      [
        { lender: "Bank", legs: [loanLeg("b", "Income", 10, "2026-08-03")] },
        { legs: [loanLeg("n", "Income", 20, "2026-08-03")] },
      ],
      "2026-09-30"
    );
    expect(rows.map((row) => row.lender)).toEqual(["", "Bank"]);
  });
});
