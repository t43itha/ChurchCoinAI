import { describe, expect, it } from "vitest";
import { incomeByProgramme } from "../lib/programmeIncome";
import { programmeIncomeSectionHTML } from "../services/pdfGenerator";
import { programmeIncomeSheetRows } from "../services/excelGenerator";

const programmes = [
  { _id: "harvest", name: "Harvest Thanksgiving" },
  { _id: "camp", name: "Summer Camp" },
];

type Row = {
  _id: string;
  amount: number;
  type: "Income" | "Expenditure";
  programmeId?: string;
  isVoided?: boolean;
  cashBankingRole?: "source_giving" | "bank_deposit";
  movementKind?: "transfer" | "reversal" | "loan";
  movementId?: string;
  isJournal?: boolean;
};

const income = (_id: string, amount: number, programmeId: string, extra: Partial<Row> = {}): Row => ({
  _id,
  amount,
  type: "Income",
  programmeId,
  ...extra,
});

describe("incomeByProgramme", () => {
  it("totals and counts gifts per programme, sorted by total descending", () => {
    const result = incomeByProgramme(
      [
        income("h1", 100, "harvest"),
        income("h2", 50.25, "harvest"),
        income("c1", 75, "camp"),
        income("c2", 10, "camp", { cashBankingRole: "source_giving" }),
      ],
      programmes
    );

    expect(result).toEqual([
      { programmeId: "harvest", name: "Harvest Thanksgiving", total: 150.25, count: 2 },
      { programmeId: "camp", name: "Summer Camp", total: 85, count: 2 },
    ]);
  });

  it("sums pence exactly", () => {
    const result = incomeByProgramme(
      [income("a", 0.1, "camp"), income("b", 0.2, "camp")],
      programmes
    );

    expect(result[0].total).toBe(0.3);
  });

  it("excludes voided rows, expenditure, and every non-income ledger effect", () => {
    const result = incomeByProgramme(
      [
        income("kept", 20, "camp"),
        income("voided", 500, "camp", { isVoided: true }),
        { ...income("expense", 30, "camp"), type: "Expenditure" },
        income("deposit", 40, "camp", { cashBankingRole: "bank_deposit" }),
        income("journal", 60, "camp", { isJournal: true }),
        income("transfer", 70, "camp", { movementKind: "transfer", movementId: "m1" }),
        income("reversal", 80, "camp", { movementKind: "reversal", movementId: "m2" }),
        income("loan", 90, "camp", { movementKind: "loan" }),
        income("untagged", 1000, "harvest", { programmeId: undefined }),
      ],
      programmes
    );

    expect(result).toEqual([
      { programmeId: "camp", name: "Summer Camp", total: 20, count: 1 },
    ]);
  });

  it("names programmes missing from the list as Unknown programme", () => {
    const result = incomeByProgramme(
      [
        income("a", 80, "deleted-programme"),
        income("b", 75, "camp"),
      ],
      programmes
    );

    expect(result).toEqual([
      { programmeId: "deleted-programme", name: "Unknown programme", total: 80, count: 1 },
      { programmeId: "camp", name: "Summer Camp", total: 75, count: 1 },
    ]);
  });

  it("returns an empty list when there is no tagged reportable income", () => {
    expect(incomeByProgramme([], programmes)).toEqual([]);
    expect(
      incomeByProgramme(
        [{ _id: "x", amount: 40, type: "Income", isVoided: true, programmeId: "camp" }],
        programmes
      )
    ).toEqual([]);
  });
});

describe("programme income in downloads", () => {
  const rows = [
    { programmeId: "harvest", name: "Harvest <Appeal>", total: 120.5, count: 3 },
    { programmeId: "camp", name: "Youth Camp", total: 80, count: 1 },
  ];

  it("adds an escaped PDF section with a total, and nothing when there is no programme income", () => {
    const html = programmeIncomeSectionHTML(rows);
    expect(html).toContain("Income by programme");
    expect(html).toContain("Harvest &lt;Appeal&gt;");
    expect(html).toContain("£200.50");
    expect(programmeIncomeSectionHTML([])).toBe("");
  });

  it("builds spreadsheet rows with a total", () => {
    expect(programmeIncomeSheetRows(rows)).toEqual([
      ["Programme", "Entries", "Amount"],
      ["Harvest <Appeal>", 3, 120.5],
      ["Youth Camp", 1, 80],
      ["Total", "", 200.5],
    ]);
  });
});
