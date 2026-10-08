// Synthetic fixtures only. Shapes follow common UK bank exports; no real statement data.
import { describe, expect, it } from "vitest";
import {
  describeLeftOutRows,
  detectColumns,
  findHeaderRow,
  mapStatementRows,
  tokenizeCsv,
} from "../lib/statementImport";

const LLOYDS = [
  "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance",
  "01/03/2026,DEBIT,12-34-56,12345678,SYNTHETIC SHOP,12.50,,100.00",
  "02/03/2026,CREDIT,12-34-56,12345678,SYNTHETIC DONATION,,50.00,150.00",
].join("\n");

const BARCLAYS = [
  "Number,Date,Account,Amount,Subcategory,Memo",
  "1,01/03/2026,00000000,-20.00,General,SYNTHETIC SHOP",
  "2,02/03/2026,00000000,100.00,Transfer,SYNTHETIC CREDIT",
].join("\n");

const NATIONWIDE = [
  '"Account Name:","Synthetic Current Account"',
  '"Account Balance:","£1,234.56"',
  '"Available Balance:","£1,200.00"',
  "",
  '"Date","Transaction type","Description","Paid out","Paid in","Balance"',
  '"01/03/2026","Card Transaction","SYNTHETIC SHOP","£10.00","","£1,224.56"',
  '"02/03/2026","Faster Payment","SYNTHETIC GIFT","","£25.00","£1,249.56"',
].join("\n");

const HSBC_HEADERLESS = [
  "01/03/2026,SYNTHETIC COFFEE,-3.50,96.50",
  "02/03/2026,SYNTHETIC INCOME,20.00,116.50",
].join("\n");

// Parses the way the component does: tokenize, find the header, detect columns, map the data records.
function importFile(text: string) {
  const records = tokenizeCsv(text).records;
  const { headerIndex, headers } = findHeaderRow(records);
  const data = records.slice(headerIndex === null ? 0 : headerIndex + 1);
  const { mapping, split, reference } = detectColumns(headers, data.map((record) => record.cells));
  const result = mapStatementRows(data, headers, mapping, split);
  return { headerIndex, headers, data, mapping, split, reference, result };
}

describe("tokenizeCsv", () => {
  it("handles quoted commas, newlines inside quotes and doubled quotes, keeping source line numbers", () => {
    const records = tokenizeCsv('Date,Description,Amount\n01/03/2026,"SYNTHETIC, MULTI\nLINE PAYEE",-12.00\n02/03/2026,"Say ""hi""",5.00\n').records;
    expect(records).toEqual([
      { cells: ["Date", "Description", "Amount"], line: 1 },
      { cells: ["01/03/2026", "SYNTHETIC, MULTI\nLINE PAYEE", "-12.00"], line: 2 },
      { cells: ["02/03/2026", 'Say "hi"', "5.00"], line: 4 },
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const records = tokenizeCsv("﻿Date,Amount\n01/03/2026,1.00\n").records;
    expect(records[0].cells).toEqual(["Date", "Amount"]);
  });

  it("accepts CRLF line endings and trims unquoted cells only", () => {
    const records = tokenizeCsv('Date , Amount\r\n01/03/2026,"  kept  "\r\n').records;
    expect(records).toEqual([
      { cells: ["Date", "Amount"], line: 1 },
      { cells: ["01/03/2026", "  kept  "], line: 2 },
    ]);
  });

  it("sniffs semicolon and tab delimiters", () => {
    expect(tokenizeCsv("Date;Description;Amount\n01/03/2026;\"Coffee, Tea\";-3.50").records[1].cells).toEqual(["01/03/2026", "Coffee, Tea", "-3.50"]);
    expect(tokenizeCsv("Date\tAmount\n01/03/2026\t1.00").records[1].cells).toEqual(["01/03/2026", "1.00"]);
  });

  it("drops fully empty lines but keeps physical line numbers", () => {
    const records = tokenizeCsv("\n\nDate,Amount\n\n01/03/2026,1.00\n").records;
    expect(records).toEqual([
      { cells: ["Date", "Amount"], line: 3 },
      { cells: ["01/03/2026", "1.00"], line: 5 },
    ]);
  });

  it("reports an unterminated quote and does not emit the unclosed record", () => {
    const { records, error } = tokenizeCsv('Date,Amount,Description\n01/03/2026,-10.00,"First payment\n02/03/2026,20.00,Second payment\n');
    expect(error).toEqual({ line: 2, reason: "A quote opened on line 2 is never closed" });
    expect(records).toEqual([{ cells: ["Date", "Amount", "Description"], line: 1 }]);
  });

  it("returns no records for empty text", () => {
    expect(tokenizeCsv("").records).toEqual([]);
    expect(tokenizeCsv("\n \n").records).toEqual([]);
  });
});

describe("findHeaderRow", () => {
  it("skips a bank preamble and blank line above the real header", () => {
    const { headerIndex, headers } = findHeaderRow(tokenizeCsv(NATIONWIDE).records);
    expect(headerIndex).toBe(3);
    expect(headers).toEqual(["Date", "Transaction type", "Description", "Paid out", "Paid in", "Balance"]);
  });

  it("finds a header on the first line of a Lloyds-style export", () => {
    expect(findHeaderRow(tokenizeCsv(LLOYDS).records).headerIndex).toBe(0);
  });

  it("treats data rows with no header as headerless and names the columns", () => {
    expect(findHeaderRow(tokenizeCsv(HSBC_HEADERLESS).records)).toEqual({
      headerIndex: null,
      headers: ["Column 1", "Column 2", "Column 3", "Column 4"],
    });
  });

  it("keeps every record of a headerless file even when a later row looks like a header", () => {
    const text = "01/03/2026,Sunday offering,100.00\n31/02/2026,Date correction credit,25.00\n02/03/2026,Donation,50.00";
    const { headerIndex, headers } = findHeaderRow(tokenizeCsv(text).records);
    expect({ headerIndex, headers }).toEqual({ headerIndex: null, headers: ["Column 1", "Column 2", "Column 3"] });
    const { data, result } = importFile(text);
    expect(data).toHaveLength(3);
    expect(result.errors).toEqual([{ line: 2, reason: "Date not real", raw: "31/02/2026" }]);
    expect(result.rows).toEqual([
      { line: 1, date: "2026-03-01", description: "Sunday offering", amount: 100, type: "Income" },
      { line: 3, date: "2026-03-02", description: "Donation", amount: 50, type: "Income" },
    ]);
  });

  it("does not read a row as a header when the date word shares a cell with the label or the row holds an amount", () => {
    expect(findHeaderRow(tokenizeCsv("Statement download\n01/03/2026,Sunday offering,100.00\n31/02/2026,Date correction credit,25.00\n").records).headerIndex).toBeNull();
    expect(findHeaderRow(tokenizeCsv("Statement\nDate,Description,100.00\n").records).headerIndex).toBeNull();
  });

  it("reports no header for text that is neither a header nor transaction data", () => {
    expect(findHeaderRow(tokenizeCsv("Hello there\nNothing to see").records)).toEqual({ headerIndex: null, headers: [] });
  });
});

describe("detectColumns", () => {
  it("maps Lloyds split debit and credit columns", () => {
    const { mapping, split } = importFile(LLOYDS);
    expect(split).toBe(true);
    expect(mapping).toEqual({
      date: "Transaction Date",
      description: "Transaction Description",
      amount: "",
      amountIn: "Credit Amount",
      amountOut: "Debit Amount",
    });
  });

  it("maps Barclays single amount column with Memo as the description", () => {
    const { mapping, split } = importFile(BARCLAYS);
    expect(split).toBe(false);
    expect(mapping).toMatchObject({ date: "Date", description: "Memo", amount: "Amount" });
  });

  it("maps Nationwide paid in and paid out and never the Balance column", () => {
    const { mapping, split } = importFile(NATIONWIDE);
    expect(split).toBe(true);
    expect(mapping).toMatchObject({ date: "Date", description: "Description", amountIn: "Paid in", amountOut: "Paid out" });
  });

  it("excludes balance columns from amount detection", () => {
    const { mapping } = detectColumns(["Date", "Description", "Balance", "Value"], [["01/03/2026", "SYNTHETIC", "100.00", "5.00"]]);
    expect(mapping.amount).toBe("Value");
  });

  it("infers columns from values for headerless files and prefers the earlier amount column over a balance", () => {
    const { headers, mapping, split } = importFile(HSBC_HEADERLESS);
    expect(headers).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"]);
    expect(split).toBe(false);
    expect(mapping).toEqual({ date: "Column 1", description: "Column 2", amount: "Column 3", amountIn: "", amountOut: "" });
  });

  it("counts readable zeros as amounts and prefers the amount column over a running balance", () => {
    const { mapping, result } = importFile([
      "01/03/2026,Opening balance,0.00,100.00",
      "02/03/2026,Coffee,-3.50,96.50",
      "03/03/2026,Offering,20.00,116.50",
    ].join("\n"));
    expect(mapping).toMatchObject({ amount: "Column 3" });
    expect(result.rows.map((row) => [row.description, row.amount, row.type])).toEqual([
      ["Coffee", 3.5, "Expenditure"],
      ["Offering", 20, "Income"],
    ]);
    expect(result.errors).toEqual([{ line: 1, reason: "Amount is zero", raw: "0.00" }]);
  });

  it("skips a running balance that comes before the amount column", () => {
    const { mapping, result } = importFile([
      "01/03/2026,Coffee,100.00,-3.50",
      "02/03/2026,Donation,96.50,-3.50",
      "03/03/2026,Offering,116.50,20.00",
    ].join("\n"));
    expect(mapping).toMatchObject({ amount: "Column 4" });
    expect(result.rows.map((row) => [row.description, row.amount, row.type])).toEqual([
      ["Coffee", 3.5, "Expenditure"],
      ["Donation", 3.5, "Expenditure"],
      ["Offering", 20, "Income"],
    ]);
  });

  it("returns a reference column when the file has one", () => {
    const { reference } = detectColumns(["Date", "Reference", "Description", "Amount"], [["01/03/2026", "R1", "SYNTHETIC", "1.00"]]);
    expect(reference).toBe("Reference");
  });
});

describe("mapStatementRows", () => {
  it("maps Lloyds split rows to income and expenditure with line numbers", () => {
    const { result } = importFile(LLOYDS);
    expect(result.rows).toEqual([
      { line: 2, date: "2026-03-01", description: "SYNTHETIC SHOP", amount: 12.5, type: "Expenditure" },
      { line: 3, date: "2026-03-02", description: "SYNTHETIC DONATION", amount: 50, type: "Income" },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("maps Barclays signed amounts", () => {
    const { result } = importFile(BARCLAYS);
    expect(result.rows.map((row) => [row.amount, row.type])).toEqual([
      [20, "Expenditure"],
      [100, "Income"],
    ]);
  });

  it("strips pound signs and points line numbers past a preamble", () => {
    const { result, headerIndex } = importFile(NATIONWIDE);
    expect(headerIndex).toBe(3);
    expect(result.rows).toEqual([
      { line: 6, date: "2026-03-01", description: "SYNTHETIC SHOP", amount: 10, type: "Expenditure" },
      { line: 7, date: "2026-03-02", description: "SYNTHETIC GIFT", amount: 25, type: "Income" },
    ]);
  });

  it("maps headerless HSBC-style rows", () => {
    const { result } = importFile(HSBC_HEADERLESS);
    expect(result.rows).toEqual([
      { line: 1, date: "2026-03-01", description: "SYNTHETIC COFFEE", amount: 3.5, type: "Expenditure" },
      { line: 2, date: "2026-03-02", description: "SYNTHETIC INCOME", amount: 20, type: "Income" },
    ]);
  });

  it("sniffs the delimiter from CR-only line endings", () => {
    const { headers, result } = importFile("Date;Description;Amount\r01/03/2026;Shop, London, UK, card, tea, coffee;-3.50\r");
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(result.rows).toEqual([
      { line: 2, date: "2026-03-01", description: "Shop, London, UK, card, tea, coffee", amount: 3.5, type: "Expenditure" },
    ]);
  });

  it("keeps a semicolon-delimited comma inside a quoted description", () => {
    const { headers, result } = importFile("Date;Description;Amount\n01/03/2026;\"Coffee, Tea\";-3.50");
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(result.rows[0]).toMatchObject({ description: "Coffee, Tea", amount: 3.5, type: "Expenditure" });
  });

  it("keeps a multi-line quoted description and reports the line where the next record starts", () => {
    const { result } = importFile('Date,Description,Amount\n01/03/2026,"SYNTHETIC, MULTI\nLINE PAYEE",-12.00\n02/03/2026,Plain,5.00\n');
    expect(result.rows).toEqual([
      { line: 2, date: "2026-03-01", description: "SYNTHETIC, MULTI\nLINE PAYEE", amount: 12, type: "Expenditure" },
      { line: 4, date: "2026-03-02", description: "Plain", amount: 5, type: "Income" },
    ]);
  });

  it("treats signed Paid out values as expenditure and signed Paid in values as income", () => {
    const { result } = importFile([
      "Date,Description,Paid in,Paid out",
      "01/03/2026,Electricity,,-12.50",
      "02/03/2026,Rent,,(50.00)",
      "03/03/2026,Refund,-7.00,",
    ].join("\n"));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { line: 2, date: "2026-03-01", description: "Electricity", amount: 12.5, type: "Expenditure" },
      { line: 3, date: "2026-03-02", description: "Rent", amount: 50, type: "Expenditure" },
      { line: 4, date: "2026-03-03", description: "Refund", amount: 7, type: "Income" },
    ]);
  });

  it("rounds half-penny amounts away from zero and keeps the sign", () => {
    const { result } = importFile("Date,Description,Amount\n01/03/2026,Out,-1.125\n02/03/2026,In,1.125");
    expect(result.rows).toEqual([
      { line: 2, date: "2026-03-01", description: "Out", amount: 1.13, type: "Expenditure" },
      { line: 3, date: "2026-03-02", description: "In", amount: 1.13, type: "Income" },
    ]);
  });

  it("skips rows with no amount and reports unreadable dates, descriptions and amounts with their line", () => {
    const { result } = importFile([
      "Date,Description,Amount",
      "31/02/2026,Impossible day,-10.00",
      "soon,Bad date,-10.00",
      "01/03/2026,,-10.00",
      "01/03/2026,Blank amount,",
      "01/03/2026,Garbage amount,12abc",
      "01/03/2026,Zero,0.00",
      "01/03/2026,Tiny,0.004",
      "01/03/2026,Fine,1.999",
    ].join("\n"));
    expect(result.skipped).toEqual([{ line: 5, reason: "No amount" }]);
    expect(result.errors).toEqual([
      { line: 2, reason: "Date not real", raw: "31/02/2026" },
      { line: 3, reason: "Date unreadable", raw: "soon" },
      { line: 4, reason: "No description", raw: "01/03/2026 |  | -10.00" },
      { line: 6, reason: "Amount unreadable", raw: "12abc" },
      { line: 7, reason: "Amount is zero", raw: "0.00" },
      { line: 8, reason: "Amount is zero", raw: "0.004" },
    ]);
    expect(result.rows).toEqual([{ line: 9, date: "2026-03-01", description: "Fine", amount: 2, type: "Income" }]);
  });

  it("applies split-column rules: both filled, both blank, zero in the unused column, and unreadable text", () => {
    const { result } = importFile([
      "Date,Description,Paid in,Paid out",
      "01/03/2026,Both filled,5.00,5.00",
      "01/03/2026,Zero both,0.00,0.00",
      "01/03/2026,Both blank,,",
      "01/03/2026,In only,5.00,0.00",
      "01/03/2026,Out bad,,12abc",
      "01/03/2026,Out only,,7.50",
    ].join("\n"));
    expect(result.errors).toEqual([
      { line: 2, reason: "Both money in and money out filled", raw: "01/03/2026 | Both filled | 5.00 | 5.00" },
      { line: 3, reason: "Amount is zero", raw: "0.00" },
      { line: 6, reason: "Amount unreadable", raw: "12abc" },
    ]);
    expect(result.skipped).toEqual([{ line: 4, reason: "No amount" }]);
    expect(result.rows).toEqual([
      { line: 5, date: "2026-03-01", description: "In only", amount: 5, type: "Income" },
      { line: 7, date: "2026-03-01", description: "Out only", amount: 7.5, type: "Expenditure" },
    ]);
  });

  it("reports impossible dates in a Nationwide-style file at the source line", () => {
    const { result } = importFile(`${NATIONWIDE}\n"32/01/2026","Card Transaction","SYNTHETIC","£1.00","",""`);
    expect(result.errors).toEqual([
      { line: 8, reason: "Date not real", raw: "32/01/2026" },
    ]);
    expect(result.rows.map((row) => row.line)).toEqual([6, 7]);
  });

  it("accounts for every data record across mixed rows", () => {
    const fixtures = [LLOYDS, BARCLAYS, NATIONWIDE, HSBC_HEADERLESS, "Date,Description,Amount\n\n31/02/2026,X,1\n01/03/2026,,1\n01/03/2026,Y,\n01/03/2026,Z,2"];
    for (const fixture of fixtures) {
      const { data, result } = importFile(fixture);
      expect(result.rows.length + result.skipped.length + result.errors.length).toBe(data.length);
    }
  });

  it("accounts for every data record in a large generated file", () => {
    const lines = ["Date,Description,Amount"];
    const amounts = ["10.00", "", "abc", "0.00", "(5.50)", "-1.23", "31/02", "2.00"];
    for (let i = 0; i < 200; i += 1) {
      const date = i % 7 === 0 ? "31/02/2026" : "01/03/2026";
      const description = i % 11 === 0 ? "" : `SYNTHETIC ${i}`;
      lines.push(`${date},${description},${amounts[i % amounts.length]}`);
    }
    const { data, result } = importFile(lines.join("\n"));
    expect(data).toHaveLength(200);
    expect(result.rows.length + result.skipped.length + result.errors.length).toBe(200);
  });
});

describe("describeLeftOutRows", () => {
  it("names counts and the first few line numbers", () => {
    const message = describeLeftOutRows({
      errors: [47, 88, 103].map((line) => ({ line, reason: "Amount unreadable", raw: "x" })),
      skipped: [{ line: 5, reason: "No amount" }, { line: 9, reason: "No amount" }],
    });
    expect(message).toBe("3 rows couldn't be read (lines 47, 88, 103) and were left out. 2 rows had no amount and were skipped.");
  });

  it("uses singular wording for one row and returns null when nothing was left out", () => {
    expect(describeLeftOutRows({ errors: [{ line: 12, reason: "No description", raw: "x" }], skipped: [] })).toBe(
      "1 row couldn't be read (line 12) and was left out."
    );
    expect(describeLeftOutRows({ errors: [], skipped: [] })).toBeNull();
  });
});
