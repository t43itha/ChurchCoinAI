import { sumMoney } from "../convex/lib/money";
import { isReportableIncomeTransaction, type LedgerRow } from "./reportableTransactions";

export type ProgrammeIncome = {
  programmeId: string;
  name: string;
  total: number;
  count: number;
};

export function incomeByProgramme<T extends LedgerRow & { programmeId?: string }>(
  transactions: T[],
  programmes: Array<{ _id: string; name: string }>
): ProgrammeIncome[] {
  const names = new Map(programmes.map((programme) => [programme._id, programme.name]));
  const rowsByProgramme = new Map<string, T[]>();
  for (const row of transactions) {
    if (!row.programmeId || !isReportableIncomeTransaction(row)) continue;
    const rows = rowsByProgramme.get(row.programmeId);
    if (rows) rows.push(row);
    else rowsByProgramme.set(row.programmeId, [row]);
  }

  return [...rowsByProgramme]
    .map(([programmeId, rows]) => ({
      programmeId,
      name: names.get(programmeId) ?? "Unknown programme",
      total: sumMoney(rows, (row) => row.amount),
      count: rows.length,
    }))
    .sort((a, b) => b.total - a.total);
}
