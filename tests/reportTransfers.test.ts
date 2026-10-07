import { describe, expect, it } from "vitest";
import { buildTransferSummary } from "../lib/reportableTransactions";
import { transfersSectionHTML } from "../services/pdfGenerator";

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
