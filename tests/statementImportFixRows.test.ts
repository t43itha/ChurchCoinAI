import { describe, expect, it } from "vitest";
import { buildFixedRow, describeFixProblem, fixKindFor, type FixLayout } from "../components/statementImport/fixRows";
import {
  accountedFor,
  ignoredColumns,
  isMappingComplete,
  parseStatementText,
  type StatementSummary,
} from "../components/statementImport/statementFile";

const splitLayout: FixLayout = {
  headers: ["Date", "Description", "Money in", "Money out"],
  split: true,
  mapping: { date: "Date", description: "Description", amount: "", amountIn: "Money in", amountOut: "Money out" },
  records: [
    { cells: ["31/02/2026", "Gift", "", "40.00"], line: 3 },
    { cells: ["02/03/2026", "Donation", "1,2O0.00", ""], line: 5 },
    { cells: ["03/03/2026", "Bill", "", "x1"], line: 6 },
    { cells: ["04/03/2026", "", "15.00", ""], line: 7 },
    { cells: ["05/03/2026", "Both", "40.00", "40.00"], line: 8 },
  ],
};

const singleLayout: FixLayout = {
  headers: ["Date", "Description", "Amount"],
  split: false,
  mapping: { date: "Date", description: "Description", amount: "Amount", amountIn: "", amountOut: "" },
  records: [{ cells: ["01/03/2026", "Shop", "abc"], line: 2 }],
};

describe("fixKindFor", () => {
  it("maps each fixable reason to its input", () => {
    expect(fixKindFor("Date not real")).toBe("date");
    expect(fixKindFor("Date unreadable")).toBe("date");
    expect(fixKindFor("Amount unreadable")).toBe("amount");
    expect(fixKindFor("Amount is zero")).toBe("amount");
    expect(fixKindFor("No description")).toBe("description");
  });

  it("has no input for a row with both columns filled", () => {
    expect(fixKindFor("Both money in and money out filled")).toBeNull();
  });
});

describe("buildFixedRow", () => {
  it("builds a row from a corrected date, keeping the rest of the source row", () => {
    const outcome = buildFixedRow(splitLayout, { line: 3, reason: "Date not real", raw: "31/02/2026" }, "2026-02-28");
    expect(outcome).toEqual({
      ok: true,
      row: { line: 3, date: "2026-02-28", description: "Gift", amount: 40, type: "Expenditure" },
    });
  });

  it("rejects a corrected date that is not a real date", () => {
    const outcome = buildFixedRow(splitLayout, { line: 3, reason: "Date not real", raw: "31/02/2026" }, "31/02/2026");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/isn't a date/);
  });

  it("rejects an empty correction", () => {
    const outcome = buildFixedRow(splitLayout, { line: 3, reason: "Date not real", raw: "31/02/2026" }, "  ");
    expect(outcome).toEqual({ ok: false, message: "Enter the date." });
  });

  it("corrects an unreadable money-in amount and keeps it as income", () => {
    const outcome = buildFixedRow(splitLayout, { line: 5, reason: "Amount unreadable", raw: "1,2O0.00" }, "1200.00");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.row).toMatchObject({ line: 5, amount: 1200, type: "Income" });
  });

  it("corrects an unreadable money-out amount in the out column", () => {
    const outcome = buildFixedRow(splitLayout, { line: 6, reason: "Amount unreadable", raw: "x1" }, "45.00");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.row).toMatchObject({ line: 6, amount: 45, type: "Expenditure" });
  });

  it("rejects an amount that cannot be read", () => {
    const outcome = buildFixedRow(singleLayout, { line: 2, reason: "Amount unreadable", raw: "abc" }, "twelve");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/isn't an amount/);
  });

  it("fills a missing description", () => {
    const outcome = buildFixedRow(splitLayout, { line: 7, reason: "No description", raw: "04/03/2026 | ..." }, "Bakery");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.row).toMatchObject({ line: 7, description: "Bakery", amount: 15 });
  });

  it("refuses a row whose problem has no input", () => {
    const outcome = buildFixedRow(splitLayout, { line: 8, reason: "Both money in and money out filled", raw: "40.00" }, "40.00");
    expect(outcome.ok).toBe(false);
  });

  it("refuses a line that is not in the file", () => {
    const outcome = buildFixedRow(splitLayout, { line: 99, reason: "Date not real", raw: "31/02/2026" }, "2026-02-28");
    expect(outcome).toEqual({ ok: false, message: "This row is no longer in the file." });
  });
});

describe("describeFixProblem", () => {
  it("says what is wrong in words, quoting the value as read", () => {
    expect(describeFixProblem({ line: 1, reason: "Date not real", raw: "31/02/2026" })).toBe("“31/02/2026” isn't a real date");
    expect(describeFixProblem({ line: 1, reason: "Amount unreadable", raw: "1,2O0.00" })).toBe("“1,2O0.00” isn't an amount we can read");
  });
});

describe("parseStatementText", () => {
  it("finds the header below an account preamble and maps split money columns", () => {
    const text = [
      "Account Name,Main account",
      "Sort code,12-34-56",
      "Date,Description,Money in,Money out",
      "01/03/2026,J ADEYEMI TITHE,250.00,",
      "02/03/2026,BACS HMRC,,118.75",
    ].join("\n");
    const outcome = parseStatementText(text);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.statement.headerLine).toBe(3);
    expect(outcome.statement.records).toHaveLength(2);
    expect(outcome.statement.split).toBe(true);
    expect(outcome.statement.mapping).toMatchObject({ date: "Date", amountIn: "Money in", amountOut: "Money out" });
  });

  it("maps a single amount column", () => {
    const outcome = parseStatementText("Date,Description,Amount\n01/03/2026,Shop,-12.50\n");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.statement).toMatchObject({ split: false, headerLine: 1 });
    if (outcome.ok) expect(outcome.statement.mapping.amount).toBe("Amount");
  });

  it("reports a quote that is never closed", () => {
    const outcome = parseStatementText('Date,Description,Amount\n01/03/2026,"Shop,-12.50\n');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/couldn't read this file/);
  });

  it("reports a file with no transactions", () => {
    const outcome = parseStatementText("Account Name,Main account\n");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/couldn't find any transactions/);
  });
});

describe("isMappingComplete and ignoredColumns", () => {
  const headers = ["Date", "Description", "Money in", "Money out", "Balance"];
  const mapping = { date: "Date", description: "Description", amount: "", amountIn: "Money in", amountOut: "Money out" };

  it("needs every role for the chosen layout", () => {
    expect(isMappingComplete(mapping, true, headers)).toBe(true);
    expect(isMappingComplete({ ...mapping, amountOut: "" }, true, headers)).toBe(false);
    // The single-amount layout needs its amount role and ignores the in/out roles.
    expect(isMappingComplete({ ...mapping, amount: "" }, false, headers)).toBe(false);
    expect(isMappingComplete({ ...mapping, amount: "Money in" }, false, headers)).toBe(true);
  });

  it("lists the columns the import does not read", () => {
    expect(ignoredColumns(mapping, true, headers)).toEqual(["Balance"]);
  });
});

describe("accountedFor", () => {
  const summary: StatementSummary = {
    rowsRead: 142,
    added: 130,
    alreadyImported: 9,
    skipped: 2,
    needFix: 0,
    leftOut: 1,
    moneyIn: 0,
    moneyOut: 0,
  };

  it("adds every bucket back up to the rows read", () => {
    expect(accountedFor(summary)).toBe(142);
  });

  it("counts nothing before the batch exists", () => {
    expect(accountedFor({ ...summary, added: null })).toBe(12);
  });
});
