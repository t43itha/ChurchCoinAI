import { roundMoney, sumMoney } from "../convex/lib/money";
import type { MovementKind } from "./movementCategories";
import { isVoidedTransaction, type LedgerRow } from "./reportableTransactions";

export const LINK_WINDOW_DAYS = 14;

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

export function isLoanOverdue(loan: { dueDate?: string; outstanding: number }, today: string) {
  if (!loan.dueDate) return false;
  return loan.outstanding > 0 && loan.dueDate < today;
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
