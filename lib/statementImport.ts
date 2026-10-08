import { parseImportedAmount, parseImportedDate } from "./csvImport";

export type CsvRecord = { cells: string[]; line: number };

export type ColumnMapping = { date: string; description: string; amount: string; amountIn: string; amountOut: string };

export type MappedRow = { line: number; date: string; description: string; amount: number; type: "Income" | "Expenditure" };

export type MappingResult = {
  rows: MappedRow[];
  skipped: Array<{ line: number; reason: string }>;
  errors: Array<{ line: number; reason: string; raw: string }>;
};

const DELIMITERS = [",", ";", "\t"];
const DATE_WORD = /\bdate\b/i;
const DESCRIPTION_WORDS = ["desc", "payee", "details", "memo", "narrative"];
const AMOUNT_WORDS = ["amount", "value", "credit", "debit", "paid in", "paid out", "money in", "money out"];
const CREDIT_WORDS = ["credit", "paid in", "money in", "deposit"];
const DEBIT_WORDS = ["debit", "paid out", "money out", "withdrawal"];
const DATE_SHAPE = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/;
// "0", "0.00", "£0.00" and "(0.00)" are readable zeros, not unreadable text.
const ZERO_TEXT = /^\(?[-+]?0+(\.0+)?\)?$/;
// Headers that name something other than money, so their numbers are never amounts.
const NOT_AN_AMOUNT_HEADER = /\b(ref|reference|account|acc|number|no|sort ?code|cheque|id|balance)\b/i;
const MONEY_SHAPE = /[.\-+()£$]/;

const countOutsideQuotes = (line: string, delimiter: string) => {
  let inQuotes = false;
  let count = 0;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
};

// Looks at the first 20 non-empty physical lines. For each delimiter, takes its
// modal non-zero count (outside quotes) and how many lines share that count. The
// delimiter shared by the most lines wins, then the higher modal count; comma
// wins any remaining tie, and is the default when no line holds a delimiter.
const sniffDelimiter = (text: string) => {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim()).slice(0, 20);
  let best: { delimiter: string; shared: number; modal: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter)).filter((count) => count > 0);
    if (counts.length === 0) continue;
    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    const [modal, shared] = [...frequency].reduce((top, entry) => (entry[1] > top[1] ? entry : top));
    if (!best || shared > best.shared || (shared === best.shared && modal > best.modal)) {
      best = { delimiter, shared, modal };
    }
  }
  return best?.delimiter ?? ",";
};

export type CsvTokenizeResult = { records: CsvRecord[]; error: { line: number; reason: string } | null };

// RFC 4180 tokenizer. Each record carries the physical line it starts on, so
// errors can point back at the source file even after multi-line quoted fields.
// A quote that is never closed is reported as an error and its record is dropped.
export function tokenizeCsv(text: string): CsvTokenizeResult {
  const source = text.replace(/^\u{FEFF}/u, "");
  const delimiter = sniffDelimiter(source);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let inQuotes = false;
  let quoteLine = 1;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    cells.push(quoted ? field : field.trim());
    field = "";
    quoted = false;
  };
  const endRecord = () => {
    endField();
    if (cells.length > 1 || cells[0] !== "") records.push({ cells, line: recordLine });
    cells = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (inQuotes) {
      if (ch === '"' && source.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else if (ch === "\r" && source.charAt(i + 1) === "\n") {
        continue;
      } else {
        if (ch === "\n" || ch === "\r") line += 1;
        field += ch === "\r" ? "\n" : ch;
      }
      continue;
    }
    if (cells.length === 0 && field === "" && !quoted) recordLine = line;
    if (ch === '"' && !quoted && field.trim() === "") {
      inQuotes = true;
      quoted = true;
      quoteLine = line;
      field = "";
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source.charAt(i + 1) === "\n") i += 1;
      endRecord();
      line += 1;
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    return { records, error: { line: quoteLine, reason: `A quote opened on line ${quoteLine} is never closed` } };
  }
  if (cells.length > 0 || field !== "" || quoted) endRecord();
  return { records, error: null };
}

const isAmountWordCell = (lower: string) => AMOUNT_WORDS.some((word) => lower.includes(word)) || lower === "in" || lower === "out";
const isDescriptionWordCell = (lower: string) => DESCRIPTION_WORDS.some((word) => lower.includes(word));

// A header names a date column and an amount or description column in different
// cells, and holds no value that parses as an amount or a date.
const isHeaderRecord = ({ cells }: CsvRecord) => {
  if (cells.filter((cell) => cell.trim()).length < 3) return false;
  const lowered = cells.map((cell) => cell.toLowerCase());
  const labelledOtherCell = (dateIndex: number) =>
    lowered.some((cell, index) => index !== dateIndex && (isAmountWordCell(cell) || isDescriptionWordCell(cell)));
  const hasDateLabel = cells.some((cell, index) => DATE_WORD.test(cell) && labelledOtherCell(index));
  return hasDateLabel && !cells.some((cell) => parseImportedDate(cell) !== null || parseImportedAmount(cell) !== null);
};

type AmountCell = number | "blank" | "bad";

// Returns the amount rounded to pennies (half a penny away from zero), a blank marker,
// or "bad" for text that is not an amount. Readable zeros are numbers.
const readAmount = (text: string): AmountCell => {
  if (!text.trim()) return "blank";
  const parsed = parseImportedAmount(text);
  // Exponent notation shifts the decimal exactly, so 1.005 becomes 100.5 pence, not 100.4999.
  if (parsed !== null) return Math.sign(parsed) * (Math.round(Number(`${Math.abs(parsed)}e2`)) / 100);
  if (ZERO_TEXT.test(text.replace(/[£$,\s]/g, ""))) return 0;
  return "bad";
};

const looksLikeData = (cells: string[]) =>
  parseImportedDate(cells[0] ?? "") !== null && cells.some((cell) => typeof readAmount(cell) === "number");

// Any row with two or more filled cells and no date or amount in it. Used only when
// no row has a recognised date label, so the user can map an unfamiliar header.
const isPlainTextRecord = ({ cells }: CsvRecord) =>
  cells.filter((cell) => cell.trim()).length >= 2 &&
  !cells.some((cell) => parseImportedDate(cell) !== null || parseImportedAmount(cell) !== null);

// Finds the real header below any bank preamble. When the first record is a
// data row instead, the file has no header, so nothing below it is searched and
// columns are named Column 1, 2, ... When no row has a recognised date label, the
// first plain-text row is used as the header so its columns can be mapped by hand.
export function findHeaderRow(records: CsvRecord[]): { headerIndex: number | null; headers: string[] } {
  const first = records[0];
  if (first && looksLikeData(first.cells)) {
    const width = records.reduce((max, record) => Math.max(max, record.cells.length), 0);
    return { headerIndex: null, headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`) };
  }
  const headerIndex = records.findIndex(isHeaderRecord);
  if (headerIndex !== -1) return { headerIndex, headers: records[headerIndex].cells };
  const fallbackIndex = records.findIndex(isPlainTextRecord);
  if (fallbackIndex !== -1) return { headerIndex: fallbackIndex, headers: records[fallbackIndex].cells };
  return { headerIndex: null, headers: [] };
}

// Guesses the column roles from header names first, then from cell values for
// any role the headers did not name. Balance and reference columns are never
// amounts, and when several numeric columns remain equally likely the user picks.
export function detectColumns(headers: string[], sampleRows: string[][]): { mapping: ColumnMapping; split: boolean; reference?: string } {
  const mapping: ColumnMapping = { date: "", description: "", amount: "", amountIn: "", amountOut: "" };
  headers.forEach((header) => {
    const lower = header.toLowerCase();
    if (lower.includes("date") && !mapping.date) mapping.date = header;
    else if (DESCRIPTION_WORDS.some((word) => lower.includes(word)) && !mapping.description) mapping.description = header;
  });

  const creditCol = headers.find((header) => {
    const lower = header.toLowerCase();
    return CREDIT_WORDS.some((word) => lower.includes(word)) || lower === "in";
  });
  const debitCol = headers.find((header) => {
    const lower = header.toLowerCase();
    return DEBIT_WORDS.some((word) => lower.includes(word)) || lower === "out";
  });
  const split = Boolean(creditCol && debitCol);
  if (split) {
    mapping.amountIn = creditCol ?? "";
    mapping.amountOut = debitCol ?? "";
  } else {
    const amount = headers.find((header) => {
      const lower = header.toLowerCase();
      return (lower.includes("amount") || lower.includes("value")) && !lower.includes("balance");
    });
    if (amount) mapping.amount = amount;
  }

  const cellsOf = (index: number) => sampleRows.map((row) => row[index] ?? "").filter((cell) => cell.trim());
  const share = (index: number, parse: (cell: string) => unknown) => {
    const cells = cellsOf(index);
    return cells.length === 0 ? 0 : cells.filter((cell) => parse(cell) !== null).length / cells.length;
  };
  const bestBy = (candidates: number[], score: (index: number) => number) =>
    candidates.reduce<number | null>((best, index) => {
      const value = score(index);
      if (value <= 0.5) return best;
      return best === null || value > score(best) ? index : best;
    }, null);
  const indexes = headers.map((_, index) => index);
  const headerIndexOf = (name: string) => headers.indexOf(name);

  if (!mapping.date) {
    const best = bestBy(indexes, (index) => share(index, parseImportedDate));
    if (best !== null) mapping.date = headers[best];
  }
  if (!split && !mapping.amount) {
    const candidates = indexes.filter((index) => !NOT_AN_AMOUNT_HEADER.test(headers[index]) && index !== headerIndexOf(mapping.date));
    const amountShare = (index: number) => share(index, (cell) => (readAmount(cell) === "bad" ? null : true));
    const qualifying = candidates.filter((index) => amountShare(index) > 0.5);
    // Columns with a decimal point, a sign or brackets look like money; whole numbers may be references.
    const moneyShaped = qualifying.filter((index) => cellsOf(index).some((cell) => MONEY_SHAPE.test(cell)));
    const ranked = moneyShaped.length > 0 ? moneyShaped : qualifying;
    const topShare = ranked.reduce((top, index) => Math.max(top, amountShare(index)), 0);
    const tied = ranked.filter((index) => amountShare(index) === topShare);
    // Two equally good candidates are ambiguous; the user picks the amount column.
    if (tied.length === 1) mapping.amount = headers[tied[0]];
  }
  if (!mapping.description) {
    const taken = new Set([mapping.date, mapping.amount, mapping.amountIn, mapping.amountOut]);
    let best: { index: number; length: number } | null = null;
    for (const index of indexes) {
      if (taken.has(headers[index])) continue;
      const cells = cellsOf(index);
      if (cells.length === 0) continue;
      const length = cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
      if (!best || length > best.length) best = { index, length };
    }
    if (best) mapping.description = headers[best.index];
  }

  const used = new Set([mapping.date, mapping.description, mapping.amount, mapping.amountIn, mapping.amountOut]);
  const reference = headers.find((header) => /\b(reference|ref)\b/i.test(header) && !used.has(header));
  return { mapping, split, reference };
}

// Turns data records into review rows. Every record ends up in exactly one of
// rows, skipped or errors, so nothing is silently dropped.
export function mapStatementRows(records: CsvRecord[], headers: string[], mapping: ColumnMapping, split: boolean): MappingResult {
  const at = (cells: string[], name: string) => {
    const index = headers.indexOf(name);
    return index === -1 ? "" : (cells[index] ?? "").trim();
  };
  const result: MappingResult = { rows: [], skipped: [], errors: [] };

  for (const { cells, line } of records) {
    const rowText = cells.join(" | ");
    const fail = (reason: string, raw: string) => result.errors.push({ line, reason, raw: raw || rowText });

    let signed: number;
    if (split) {
      const inText = at(cells, mapping.amountIn);
      const outText = at(cells, mapping.amountOut);
      const inValue = readAmount(inText);
      const outValue = readAmount(outText);
      if (inValue === "bad") { fail("Amount unreadable", inText); continue; }
      if (outValue === "bad") { fail("Amount unreadable", outText); continue; }
      const inFilled = typeof inValue === "number" && inValue !== 0;
      const outFilled = typeof outValue === "number" && outValue !== 0;
      if (inFilled && outFilled) { fail("Both money in and money out filled", rowText); continue; }
      // The column sets the direction; a sign inside the cell is not a second instruction.
      if (inFilled) signed = Math.abs(inValue);
      else if (outFilled) signed = -Math.abs(outValue);
      else {
        if (inValue === "blank" && outValue === "blank") result.skipped.push({ line, reason: "No amount" });
        else fail("Amount is zero", inText || outText);
        continue;
      }
    } else {
      const amountText = at(cells, mapping.amount);
      const value = readAmount(amountText);
      if (value === "blank") { result.skipped.push({ line, reason: "No amount" }); continue; }
      if (value === "bad") { fail("Amount unreadable", amountText); continue; }
      if (value === 0) { fail("Amount is zero", amountText); continue; }
      signed = value;
    }

    const description = at(cells, mapping.description);
    if (!description) { fail("No description", rowText); continue; }

    const dateText = at(cells, mapping.date);
    const date = parseImportedDate(dateText);
    if (!date) { fail(DATE_SHAPE.test(dateText) ? "Date not real" : "Date unreadable", dateText); continue; }

    result.rows.push({ line, date, description, amount: Math.abs(signed), type: signed > 0 ? "Income" : "Expenditure" });
  }
  return result;
}

// Matches the server's limit on a single bulkCreate call.
export const MAX_IMPORT_ROWS = 500;

// Whether a total number of rows to import is over the limit for one bulkCreate call.
export const exceedsImportLimit = (total: number) => total > MAX_IMPORT_ROWS;

const listLines = (lines: number[]) => {
  const shown = lines.slice(0, 5).join(", ");
  const more = lines.length > 5 ? ` and ${lines.length - 5} more` : "";
  return `${lines.length === 1 ? "line" : "lines"} ${shown}${more}`;
};

// Names each reason a row was left out with its lines, grouped by reason, or null
// when every row was accepted. Skipped rows (no amount) are listed separately.
export function describeLeftOutRows({ skipped, errors }: Pick<MappingResult, "skipped" | "errors">): string | null {
  const parts: string[] = [];
  const linesByReason = new Map<string, number[]>();
  for (const error of errors) linesByReason.set(error.reason, [...(linesByReason.get(error.reason) ?? []), error.line]);
  if (linesByReason.size > 0) {
    const groups = [...linesByReason].map(([reason, lines]) => `${reason} (${listLines(lines)})`);
    parts.push(`Left out: ${groups.join("; ")}.`);
  }
  if (skipped.length > 0) {
    parts.push(`Skipped with no amount: ${listLines(skipped.map((row) => row.line))}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
