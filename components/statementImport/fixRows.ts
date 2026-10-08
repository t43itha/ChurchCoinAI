// Turning a row the mapping could not read into a MappedRow, from the values the user typed.
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

// Corrections already typed for one source line, keyed by column heading.
export type Corrections = Record<string, string>;

// Which input a reason needs. Reasons with none (both columns filled) get no input.
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

// Where a line stands after one correction is checked against the mapping.
//  - fixed: every problem on the line now passes; the row can join the review.
//  - next: the corrected line still has a problem; the corrections so far are kept.
//  - rejected: the typed value itself is unusable; nothing changed.
export type FixAttempt =
  | { status: "fixed"; row: MappedRow }
  | { status: "next"; error: FixableError; corrections: Corrections }
  | { status: "rejected"; message: string };

const EMPTY_MESSAGE: Record<FixKind, string> = {
  date: "Enter the date.",
  amount: "Enter the amount.",
  description: "Enter a description.",
};

// The source cells with every correction so far written in.
function patchedCells(layout: FixLayout, record: CsvRecord, corrections: Corrections): string[] {
  const cells = [...record.cells];
  for (const [header, text] of Object.entries(corrections)) {
    const index = layout.headers.indexOf(header);
    if (index === -1) continue;
    while (cells.length <= index) cells.push("");
    cells[index] = text;
  }
  return cells;
}

// The heading the current problem sits under. For split columns, the money column
// whose cell holds the bad value.
function columnFor(kind: FixKind, error: FixableError, cells: string[], layout: FixLayout): string {
  const { mapping, split, headers } = layout;
  if (kind === "date") return mapping.date;
  if (kind === "description") return mapping.description;
  if (!split) return mapping.amount;
  const inIndex = headers.indexOf(mapping.amountIn);
  const inCell = inIndex === -1 ? "" : (cells[inIndex] ?? "").trim();
  return inCell === error.raw.trim() ? mapping.amountIn : mapping.amountOut;
}

// Writes one typed value into the line and runs the statement mapping on that line
// alone, so a fixed row is validated exactly like one read from the file. Earlier
// corrections on the same line are kept, and a further problem is handed back as
// the next error rather than discarding the work.
export function attemptFix(layout: FixLayout, error: FixableError, corrections: Corrections, value: string): FixAttempt {
  const kind = fixKindFor(error.reason);
  if (!kind) return { status: "rejected", message: "This row can't be fixed here. Leave it out." };

  const text = value.trim();
  if (!text) return { status: "rejected", message: EMPTY_MESSAGE[kind] };
  if (kind === "date" && parseImportedDate(text) === null) {
    return { status: "rejected", message: "That isn't a date we can read. Use day, month and year." };
  }
  if (kind === "amount" && parseImportedAmount(text) === null) {
    return { status: "rejected", message: "That isn't an amount we can read. Use numbers, like 1200.00." };
  }

  const record = layout.records.find((candidate) => candidate.line === error.line);
  if (!record) return { status: "rejected", message: "This row is no longer in the file." };

  const column = columnFor(kind, error, patchedCells(layout, record, corrections), layout);
  if (!layout.headers.includes(column)) {
    return { status: "rejected", message: "This row's column can't be found in the file." };
  }

  const nextCorrections = { ...corrections, [column]: text };
  const result = mapStatementRows(
    [{ cells: patchedCells(layout, record, nextCorrections), line: record.line }],
    layout.headers,
    layout.mapping,
    layout.split
  );
  const [row] = result.rows;
  if (row) return { status: "fixed", row };
  const problem = result.errors[0];
  if (problem) return { status: "next", error: problem, corrections: nextCorrections };
  return { status: "rejected", message: "This row still has no amount." };
}
