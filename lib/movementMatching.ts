import { resolveCategoryForTransaction } from "../convex/intelligence/categorization/categoryResolver";
import type { CategoryLike } from "../convex/intelligence/categorization/types";
import { meetsMoneyTarget, roundMoney, sumMoney } from "../convex/lib/money";
import type { LoanReportRow } from "../types";
import type { MovementKind } from "./movementCategories";
import { isUnlinkedMovementLeg, isVoidedTransaction, type LedgerRow } from "./reportableTransactions";

export const LINK_WINDOW_DAYS = 14;

// Which link actions a row offers. A voided row has none: voiding unlinks it.
export type LinkState =
  | { status: "none" }
  | { status: "waiting"; kind: MovementKind }
  | { status: "linked"; kind: MovementKind }
  | { status: "journal" };

export function linkState(row: LedgerRow): LinkState {
  if (isUnlinkedMovementLeg(row)) return { status: "waiting", kind: row.movementKind! };
  if (isVoidedTransaction(row) || row.movementId === undefined) return { status: "none" };
  if (row.isJournal) return { status: "journal" };
  if (row.movementKind === undefined) return { status: "none" };
  return { status: "linked", kind: row.movementKind };
}

export type MovementLeg = LedgerRow & { _id: string; date: string; fundId: string };

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  transfer: "transfer between funds",
  reversal: "returned payment",
  loan: "loan",
};

const pence = (amount: number) => Math.round(amount * 100);

// Dates are YYYY-MM-DD and ids are plain strings, so code-unit order is the order we want.
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const formatMoney = (amount: number) =>
  `£${roundMoney(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isIncome = (leg: MovementLeg) => leg.type === "Income";
const isExpenditure = (leg: MovementLeg) => leg.type === "Expenditure";

const DAY_MS = 86_400_000;

// Whole days since the epoch for a YYYY-MM-DD date. UTC avoids daylight-saving
// shifts when two dates straddle a clock change.
const dayNumber = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};

const dayDistance = (a: string, b: string) => Math.abs(dayNumber(a) - dayNumber(b));

// Candidates are unlinked active legs of the same kind on the opposite side,
// for the same amount to the penny, within the link window.
export function linkCandidates<T extends MovementLeg>(leg: MovementLeg, pool: T[]): T[] {
  if (leg.movementKind !== "transfer" && leg.movementKind !== "reversal") return [];
  const kind = leg.movementKind;
  const amount = pence(leg.amount);

  return pool
    .filter(
      (candidate) =>
        candidate._id !== leg._id &&
        candidate.movementKind === kind &&
        candidate.type !== leg.type &&
        pence(candidate.amount) === amount &&
        candidate.movementId === undefined &&
        !isVoidedTransaction(candidate) &&
        candidate.isJournal !== true &&
        dayDistance(candidate.date, leg.date) <= LINK_WINDOW_DAYS &&
        (kind !== "transfer" || candidate.fundId !== leg.fundId)
    )
    .sort(
      (a, b) =>
        dayDistance(a.date, leg.date) - dayDistance(b.date, leg.date) ||
        compareText(a.date, b.date) ||
        compareText(a._id, b._id)
    );
}

// Null when the legs form a complete movement of this kind.
export function movementProblem(kind: MovementKind, legs: MovementLeg[]): string | null {
  const label = MOVEMENT_LABELS[kind];
  if (legs.length === 0) return "Choose the transactions to link.";
  if (legs.some(isVoidedTransaction)) return "Voided transactions can't be linked.";
  if (legs.some((leg) => leg.movementKind !== kind)) {
    return `Every transaction must be marked as a ${label} to link them.`;
  }

  if (kind === "loan") {
    if (!legs.some(isIncome)) return "A loan needs the amount received.";
    const { borrowed, repaid } = summarizeLoan(legs);
    if (pence(repaid) > pence(borrowed)) {
      return `Repayments (${formatMoney(repaid)}) can't be more than the amount received (${formatMoney(borrowed)}).`;
    }
    return null;
  }

  if (legs.length < 2) return "Choose the other side.";

  const moneyIn = sumMoney(legs.filter(isIncome), (leg) => leg.amount);
  const moneyOut = sumMoney(legs.filter(isExpenditure), (leg) => leg.amount);
  if (pence(moneyIn) !== pence(moneyOut)) {
    return `Money in (${formatMoney(moneyIn)}) must equal money out (${formatMoney(moneyOut)}).`;
  }

  if (kind === "transfer") {
    const fundsIn = new Set(legs.filter(isIncome).map((leg) => leg.fundId));
    if (legs.some((leg) => isExpenditure(leg) && fundsIn.has(leg.fundId))) {
      return "The two sides of a transfer must be in different funds.";
    }
  }

  return null;
}

export type LoanSummary = { borrowed: number; repaid: number; outstanding: number; isRepaid: boolean };

// Money received is Income; repayments are Expenditure.
export function summarizeLoan(legs: MovementLeg[]): LoanSummary {
  const active = legs.filter((leg) => !isVoidedTransaction(leg));
  const borrowed = sumMoney(active.filter(isIncome), (leg) => leg.amount);
  const repaid = sumMoney(active.filter(isExpenditure), (leg) => leg.amount);
  const outstanding = roundMoney(borrowed - repaid);
  return { borrowed, repaid, outstanding, isRepaid: borrowed > 0 && outstanding <= 0 };
}

// Each loan as it stood on throughDate. Legs after it, and voided legs, don't count.
export function loanReportRows(
  loans: Array<{ lender?: string; dueDate?: string; legs: MovementLeg[] }>,
  throughDate: string
): LoanReportRow[] {
  return loans
    .flatMap((loan) => {
      const legs = loan.legs.filter((leg) => !isVoidedTransaction(leg) && leg.date <= throughDate);
      if (legs.length === 0) return [];
      const { borrowed, repaid, outstanding } = summarizeLoan(legs);
      return [{ lender: loan.lender ?? "", dueDate: loan.dueDate, borrowed, repaid, outstanding }];
    })
    .sort((a, b) => a.lender.localeCompare(b.lender));
}

export function isLoanOverdue(loan: { dueDate?: string; outstanding: number }, today: string) {
  if (!loan.dueDate) return false;
  return loan.outstanding > 0 && loan.dueDate < today;
}

// The loans a repayment of this amount can go to: still open, and owing at least the amount.
export function openLoansFor<T extends { isRepaid: boolean; outstanding: number }>(loans: T[], amount: number): T[] {
  return loans.filter((loan) => !loan.isRepaid && meetsMoneyTarget(loan.outstanding, amount));
}

export type PairSuggestion = { source: "import" | "ledger"; id: string };

// Greedy one-to-one pairing, earliest import row first. Import-import pairs are
// recorded under both rows.
export function suggestImportPairs(
  importLegs: MovementLeg[],
  ledgerLegs: MovementLeg[]
): Map<string, PairSuggestion> {
  const importIds = new Set(importLegs.map((leg) => leg._id));
  const sortedImport = [...importLegs].sort(
    (a, b) => compareText(a.date, b.date) || compareText(a._id, b._id)
  );
  const used = new Set<string>();
  const pairs = new Map<string, PairSuggestion>();

  for (const leg of sortedImport) {
    if (used.has(leg._id)) continue;
    const pool = [...sortedImport, ...ledgerLegs].filter((other) => !used.has(other._id));
    const [partner] = linkCandidates(leg, pool);
    if (!partner) continue;

    used.add(leg._id);
    used.add(partner._id);
    const partnerIsImport = importIds.has(partner._id);
    pairs.set(leg._id, { source: partnerIsImport ? "import" : "ledger", id: partner._id });
    if (partnerIsImport) pairs.set(partner._id, { source: "import", id: leg._id });
  }
  return pairs;
}

// A review row as the import screen holds it. Fields are optional because a
// row is edited before it is complete; legs are only built from complete rows.
export type PairingRow = {
  reviewRowId?: string;
  date?: string;
  amount?: number;
  type?: "Income" | "Expenditure";
  fundId?: string;
  category?: string;
  pairWith?: PairSuggestion;
  pairBasis?: string;
};

export function reviewLeg(row: {
  reviewRowId: string;
  date: string;
  amount: number;
  type: "Income" | "Expenditure";
  fundId?: string;
  movementKind?: MovementKind;
}): MovementLeg {
  return {
    _id: row.reviewRowId,
    date: row.date,
    amount: row.amount,
    type: row.type,
    fundId: row.fundId ?? "",
    movementKind: row.movementKind,
  };
}

// What an accepted pair was agreed against. Changing any of these voids the pair.
export function pairBasis(row: { amount?: number; type?: string; fundId?: string; category?: string }): string {
  return [pence(row.amount ?? 0), row.type, row.fundId, row.category].join("|");
}

const movementLegFor = (row: PairingRow, categories: CategoryLike[]): MovementLeg | null => {
  if (!row.reviewRowId || !row.date || row.amount === undefined || !row.type) return null;
  const movementKind = resolveCategoryForTransaction(row.category ?? "", row.type, categories)?.movementKind;
  if (movementKind !== "transfer" && movementKind !== "reversal") return null;
  return reviewLeg({
    reviewRowId: row.reviewRowId,
    date: row.date,
    amount: row.amount,
    type: row.type,
    fundId: row.fundId,
    movementKind,
  });
};

export function importMovementLegs(rows: PairingRow[], categories: CategoryLike[]): MovementLeg[] {
  return rows.flatMap((row) => movementLegFor(row, categories) ?? []);
}

export function ledgerMovementLegs(transactions: MovementLeg[]): MovementLeg[] {
  return transactions.filter((transaction) => isUnlinkedMovementLeg(transaction));
}

// An accepted pair counts only while its rows still match what was accepted,
// and an import pair only while both rows point at each other.
export function livePairs(rows: PairingRow[]): Map<string, PairSuggestion> {
  const rowsById = new Map(rows.flatMap((row) => (row.reviewRowId ? [[row.reviewRowId, row] as const] : [])));
  const live = new Map<string, PairSuggestion>();
  for (const row of rows) {
    const rowId = row.reviewRowId;
    const pair = row.pairWith;
    if (!rowId || !pair || row.pairBasis !== pairBasis(row)) continue;
    if (pair.source === "import") {
      const partner = rowsById.get(pair.id);
      if (!partner || partner.pairWith?.id !== rowId || partner.pairBasis !== pairBasis(partner)) continue;
    }
    live.set(rowId, pair);
  }
  return live;
}

// Pairs to link at import, as [created id, partner id], after re-checking each
// pair against current state. `unmatched` counts pairs that no longer match.
// Pairs with a skipped duplicate on either side are left out silently.
export function acceptedPairsToLink(input: {
  rows: PairingRow[];
  createdIds: Map<string, string>;
  categories: CategoryLike[];
  ledger: MovementLeg[];
}): { links: Array<[string, string]>; unmatched: number } {
  const legs = new Map(importMovementLegs(input.rows, input.categories).map((leg) => [leg._id, leg]));
  const ledgerById = new Map(input.ledger.map((transaction) => [transaction._id, transaction]));
  const used = new Set<string>();
  const links: Array<[string, string]> = [];
  let unmatched = 0;

  for (const [rowId, pair] of livePairs(input.rows)) {
    const leg = legs.get(rowId);
    const createdId = input.createdIds.get(rowId);
    if (!leg || !createdId) continue;

    if (pair.source === "import") {
      // Each import pair is handled once, from its smaller row id.
      if (rowId > pair.id) continue;
      const partnerLeg = legs.get(pair.id);
      const partnerId = input.createdIds.get(pair.id);
      if (!partnerLeg || !partnerId) continue;
      if (linkCandidates(leg, [partnerLeg]).length === 0) {
        unmatched += 1;
        continue;
      }
      links.push([createdId, partnerId]);
      continue;
    }

    const ledgerRow = ledgerById.get(pair.id);
    if (!ledgerRow || used.has(pair.id) || !isUnlinkedMovementLeg(ledgerRow) || linkCandidates(leg, [ledgerRow]).length === 0) {
      unmatched += 1;
      continue;
    }
    used.add(pair.id);
    links.push([createdId, pair.id]);
  }
  return { links, unmatched };
}
