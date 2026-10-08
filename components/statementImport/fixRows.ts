// Turning a row the mapping could not read into a MappedRow, from the value the user typed.
import { parseImportedAmount, parseImportedDate } from "../../lib/csvImport";
import {
  mapStatementRows,
  type ColumnMapping,
  type CsvRecord,
  type MappedRow,
} from "../../lib/statementImport";

export interface FixableError {
  line: number;
  reason: string;
  raw: string;
}

export type FixKind = "date" | "amount" | "description";

// Which input a reason needs. Reasons with no input (both columns filled) are left out only.
export function fixKindFor(reason: string): FixKind | null {
  if (reason === "Date not real" || reason === "Date unreadable") return "date";
  if (reason === "Amount unreadable" || reason === "Amount is zero") return "amount";
  if (reason === "No description") return "description";
  return null;
}

export const FIX_ACTION: Record<FixKind, string> = {
  date: "Use date",
  amount: "Use amount",
  description: "Use text",
};

// The problem in words, for the card.
export function describeFixProblem(error: FixableError): string {
  const shown = `“${error.raw}”`;
  switch (error.reason) {
    case "Date not real":
      return `${shown} isn't a real date`;
    case "Date unreadable":
      return `${shown} isn't a date we can read`;
    case "Amount unreadable":
      return `${shown} isn't an amount we can read`;
    case "Amount is zero":
      return "The amount is zero, so there is nothing to record";
    case "No description":
      return "This row has no description";
    case "Both money in and money out filled":
      return "Money in and money out are both filled on this row";
    default:
      return error.reason;
  }
}

export interface FixLayout {
  records: CsvRecord[];
  headers: string[];
  mapping: ColumnMapping;
  split: boolean;
}

export type FixResult = { ok: true; row: MappedRow } | { ok: false; message: string };

const EMPTY_MESSAGE: Record<FixKind, string> = {
  date: "Enter the date.",
  amount: "Enter the amount.",
  description: "Enter a description.",
};

// The column the fix replaces. For split columns, the one whose cell holds the bad value.
function columnFor(kind: FixKind, error: FixableError, record: CsvRecord, layout: FixLayout): string {
  const { mapping, split, headers } = layout;
  if (kind === "date") return mapping.date;
  if (kind === "description") return mapping.description;
  if (!split) return mapping.amount;
  const inIndex = headers.indexOf(mapping.amountIn);
  const inCell = inIndex === -1 ? "" : (record.cells[inIndex] ?? "").trim();
  return inCell === error.raw.trim() ? mapping.amountIn : mapping.amountOut;
}

// Replaces the one cell the user corrected and runs the statement mapping on that
// record alone, so a fixed row is validated exactly like one read from the file.
// Rejected values come back with a message for the card; nothing is added.
export function buildFixedRow(layout: FixLayout, error: FixableError, value: string): FixResult {
  const kind = fixKindFor(error.reason);
  if (!kind) return { ok: false, message: "This row can't be fixed here. Leave it out." };

  const text = value.trim();
  if (!text) return { ok: false, message: EMPTY_MESSAGE[kind] };
  if (kind === "date" && parseImportedDate(text) === null) {
    return { ok: false, message: "That isn't a date we can read. Use day, month and year." };
  }
  if (kind === "amount" && parseImportedAmount(text) === null) {
    return { ok: false, message: "That isn't an amount we can read. Use numbers, like 1200.00." };
  }

  const record = layout.records.find((candidate) => candidate.line === error.line);
  if (!record) return { ok: false, message: "This row is no longer in the file." };

  const column = columnFor(kind, error, record, layout);
  const index = layout.headers.indexOf(column);
  if (index === -1) return { ok: false, message: "This row's column can't be found in the file." };

  const cells = [...record.cells];
  while (cells.length <= index) cells.push("");
  cells[index] = text;

  const result = mapStatementRows([{ cells, line: record.line }], layout.headers, layout.mapping, layout.split);
  const [row] = result.rows;
  if (row) return { ok: true, row };
  const reason = result.errors[0]?.reason ?? "it is still blank";
  return { ok: false, message: `Still not right: ${reason.toLowerCase()}.` };
}
