// Reading a CSV statement into a column mapping, and the numbers the receipt shows.
// Pure: the wizard does the FileReader work and passes the text in.
import {
  detectColumns,
  findHeaderRow,
  tokenizeCsv,
  type ColumnMapping,
  type CsvRecord,
} from "../../lib/statementImport";

export type ColumnRole = "date" | "description" | "amount" | "amountIn" | "amountOut";

export const ROLE_LABEL: Record<ColumnRole, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  amountIn: "Money in",
  amountOut: "Money out",
};

export const rolesFor = (split: boolean): ColumnRole[] =>
  split ? ["date", "description", "amountIn", "amountOut"] : ["date", "description", "amount"];

// In split mode either money column may be absent (a debit-only or credit-only
// statement), as long as one is there. The other roles are always required.
export const isOptionalRole = (role: ColumnRole, split: boolean): boolean =>
  split && (role === "amountIn" || role === "amountOut");

// Every required role must name a column that exists in the file, and at least one
// money column must be mapped.
export function isMappingComplete(mapping: ColumnMapping, split: boolean, headers: string[]): boolean {
  const required = rolesFor(split).filter((role) => !isOptionalRole(role, split));
  const hasRequired = required.every((role) => headers.includes(mapping[role]));
  const hasMoney = split
    ? headers.includes(mapping.amountIn) || headers.includes(mapping.amountOut)
    : headers.includes(mapping.amount);
  return hasRequired && hasMoney;
}

// Columns the import does not read. Shown so nothing is ignored silently.
export function ignoredColumns(mapping: ColumnMapping, split: boolean, headers: string[]): string[] {
  const used = new Set(rolesFor(split).map((role) => mapping[role]));
  return headers.filter((header) => !used.has(header));
}

export interface ParsedStatement {
  headers: string[];
  // Data rows only, below the header.
  records: CsvRecord[];
  // The line the header sits on; 1 when the file has no header row.
  headerLine: number;
  mapping: ColumnMapping;
  split: boolean;
}

export type ParseStatementOutcome = { ok: true; statement: ParsedStatement } | { ok: false; message: string };

export function parseStatementText(text: string): ParseStatementOutcome {
  const { records, error } = tokenizeCsv(text);
  if (error) return { ok: false, message: `We couldn't read this file: ${error.reason}.` };

  const { headerIndex, headers } = findHeaderRow(records);
  const dataRecords = records.slice(headerIndex === null ? 0 : headerIndex + 1);
  if (headers.length === 0 || dataRecords.length === 0) {
    return { ok: false, message: "We couldn't find any transactions in this file. Check it's a CSV export of your bank statement." };
  }
  if (headers.some((header) => !header)) {
    return { ok: false, message: "This file has a column with no heading. Check the export and try again." };
  }

  const detected = detectColumns(headers, dataRecords.map((record) => record.cells));
  let { mapping, split } = detected;
  // A single debit or credit column is not detected as split; map it to its side,
  // whether detection left the amount empty or guessed that same column.
  if (!split) {
    const out = headers.find((header) => /money out|paid out|debit|withdrawal/i.test(header));
    const into = headers.find((header) => /money in|paid in|credit|deposit/i.test(header));
    const sided = mapping.amount !== "" && (mapping.amount === out || mapping.amount === into);
    if ((out || into) && (!mapping.amount || sided)) {
      mapping = { ...mapping, amount: "", amountIn: into ?? "", amountOut: out ?? "" };
      split = true;
    }
  }
  return {
    ok: true,
    statement: {
      headers,
      records: dataRecords,
      headerLine: headerIndex === null ? 1 : records[headerIndex].line,
      mapping,
      split,
    },
  };
}

// What the receipt shows. `null` means the step has not reached that count yet.
export interface StatementSummary {
  rowsRead: number | null;
  added: number | null;
  alreadyImported: number;
  skipped: number;
  needFix: number;
  leftOut: number;
  moneyIn: number;
  moneyOut: number;
}

// Every row read is in exactly one bucket, so this equals rowsRead once the mapping has run.
export function accountedFor(summary: StatementSummary): number {
  return (summary.added ?? 0) + summary.alreadyImported + summary.skipped + summary.needFix + summary.leftOut;
}
