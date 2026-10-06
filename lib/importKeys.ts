export type StatementRow = {
  date: string;
  type: "Income" | "Expenditure";
  amount: number;
  description: string;
};

export type ImportIdentityFields = {
  importKey?: string;
  bankConnectionId?: string;
  providerTransactionId?: string;
};

type LedgerRow = ImportIdentityFields & Pick<StatementRow, "date" | "type" | "amount">;

const toPence = (amount: number) => Math.round(amount * 100);

const normaliseDescription = (description: string) =>
  description.toLowerCase().replace(/\|/g, " ").replace(/\s+/g, " ").trim();

// Every key for this row's content starts with this; the occurrence follows.
export const importKeyPrefix = (row: StatementRow) =>
  `${[row.date, row.type, toPence(row.amount), normaliseDescription(row.description)].join("|")}|`;

export const importKeyOccurrence = (importKey: string, row: StatementRow) => {
  const prefix = importKeyPrefix(row);
  const occurrence = importKey.slice(prefix.length);
  return importKey.startsWith(prefix) && /^[1-9]\d*$/.test(occurrence) ? Number(occurrence) : null;
};

// Statements contain no row ids, so a row is identified by its content plus
// its position among identical rows in the same file. Two genuine £10 rows on
// one day import as |1 and |2, and uploading the file again matches both.
export function withImportKeys<T extends StatementRow>(rows: T[]): Array<T & { importKey: string }> {
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    const prefix = importKeyPrefix(row);
    const occurrence = (occurrences.get(prefix) ?? 0) + 1;
    occurrences.set(prefix, occurrence);
    return { ...row, importKey: `${prefix}${occurrence}` };
  });
}

// Bank rows are identified by the provider's id; statement rows by import key.
export function importIdentity(row: ImportIdentityFields): string | null {
  if (row.bankConnectionId && row.providerTransactionId) {
    return `bank|${row.bankConnectionId}|${row.providerTransactionId}`;
  }
  return row.importKey ? `statement|${row.importKey}` : null;
}

// Splits a review batch into rows already in the ledger and rows to review.
// Possible duplicates are new rows whose date, type and amount match a ledger
// row; they may be the same transaction imported from another source.
export function screenImportRows<T extends StatementRow & ImportIdentityFields>(
  rows: T[],
  ledger: LedgerRow[]
) {
  const imported = new Set(ledger.map(importIdentity).filter((identity) => identity !== null));
  const ledgerAmounts = new Set(ledger.map((row) => `${row.date}|${row.type}|${toPence(row.amount)}`));
  const fresh: T[] = [];
  const alreadyImported: T[] = [];
  for (const row of rows) {
    const identity = importIdentity(row);
    (identity && imported.has(identity) ? alreadyImported : fresh).push(row);
  }
  const possibleDuplicates = new Set<number>();
  fresh.forEach((row, index) => {
    if (ledgerAmounts.has(`${row.date}|${row.type}|${toPence(row.amount)}`)) possibleDuplicates.add(index);
  });
  return { fresh, alreadyImported, possibleDuplicates };
}
