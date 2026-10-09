import { roundMoney, sumMoney } from "../../convex/lib/money";
import {
  calculateReconciliationSummary,
  normalizeBankTransactionSplits,
  type BankingMedium,
  type BankTransactionSplit,
  type BankTransactionSplitInput,
  type CollectionSplit,
} from "../../lib/cashChequeBanking";
import type { CashBankingVarianceType } from "../../types";
import { toPence } from "../../lib/reconciliation";
import { shortDate } from "../cashEntry/format";

// Pure walkthrough logic for cash and cheque banking: turns what the user has ticked and typed
// into the splits the server expects, with a message for each amount that cannot be saved.

export const MIN_NOTE_LENGTH = 3;

export const VARIANCE_OPTIONS: { value: CashBankingVarianceType; label: string }[] = [
  { value: "partial_banking", label: "Partial banking" },
  { value: "petty_cash_retained_or_spent", label: "Petty cash retained/spent" },
  { value: "bank_counting_difference", label: "Bank counting difference" },
  { value: "cheque_timing", label: "Cheque timing" },
  { value: "other", label: "Other" },
];

export const MEDIUM_CHOICES = ["Cash", "Cheques", "Both"] as const;
export type MediumChoice = (typeof MEDIUM_CHOICES)[number];

const MEDIUM_BY_CHOICE: Record<MediumChoice, BankingMedium> = { Cash: "cash", Cheques: "cheque", Both: "mixed" };
const CHOICE_BY_MEDIUM: Record<BankingMedium, MediumChoice> = { cash: "Cash", cheque: "Cheques", mixed: "Both" };

export const mediumOf = (choice: MediumChoice): BankingMedium => MEDIUM_BY_CHOICE[choice];
export const choiceOf = (medium: BankingMedium): MediumChoice => CHOICE_BY_MEDIUM[medium];

// The fields the walkthrough reads from an open collection (a row of getAwaitingBanking).
export interface OpenCollection {
  _id: string;
  weekEndingDate: string;
  openCashAmount: number;
  openChequeAmount: number;
  openTotal: number;
}

// The fields the walkthrough reads from a candidate bank credit (a row of getCandidateBankCredits).
export interface BankCredit {
  _id: string;
  date: string;
  amount: number;
  description: string;
  fundId?: string;
  category?: string;
  notes?: string;
}

// Amounts as typed. Strings, so a half-typed value survives until it is validated.
export interface AmountDraft {
  cashAmount: string;
  chequeAmount: string;
}

export interface CreditDraft extends AmountDraft {
  medium: BankingMedium;
}

// The saved fields of a banking that can be continued (a row of cashBankingReconciliations).
export interface SavedBanking {
  _id: string;
  cashCollectionIds: string[];
  cashCollectionSplits: { cashCollectionId: string; cashAmount: number; chequeAmount: number }[];
  bankTransactionIds: string[];
  bankTransactionSplits: { transactionId: string; medium: BankingMedium; cashAmount: number; chequeAmount: number }[];
  varianceType?: CashBankingVarianceType;
  varianceNote?: string;
}

// Where the walkthrough starts. `collectionSelection: null` means nothing has been touched yet, so
// every open collection starts ticked.
export interface BankingSeed {
  collectionSelection: string[] | null;
  collectionOverrides: Record<string, AmountDraft>;
  creditSelection: string[];
  creditDrafts: Record<string, CreditDraft>;
  varianceType: CashBankingVarianceType | "";
  varianceNote: string;
}

export const EMPTY_SEED: BankingSeed = {
  collectionSelection: null,
  collectionOverrides: {},
  creditSelection: [],
  creditDrafts: {},
  varianceType: "",
  varianceNote: "",
};

// A reopened banking loads exactly what it saved, so the user can correct it.
export function seedFromBanking(saved: SavedBanking): BankingSeed {
  return {
    collectionSelection: saved.cashCollectionIds,
    collectionOverrides: Object.fromEntries(
      saved.cashCollectionSplits.map((split) => [
        split.cashCollectionId,
        { cashAmount: split.cashAmount.toFixed(2), chequeAmount: split.chequeAmount.toFixed(2) },
      ])
    ),
    creditSelection: saved.bankTransactionIds,
    creditDrafts: Object.fromEntries(
      saved.bankTransactionSplits.map((split) => [
        split.transactionId,
        {
          medium: split.medium,
          cashAmount: split.medium === "cheque" ? "" : split.cashAmount.toFixed(2),
          chequeAmount: split.medium === "cash" ? "" : split.chequeAmount.toFixed(2),
        },
      ])
    ),
    varianceType: saved.varianceType ?? "",
    varianceNote: saved.varianceNote ?? "",
  };
}

// Empty and blank inputs are "not entered"; anything else must read as a finite number.
export function parseAmountInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : undefined;
}

export function defaultCollectionAmounts(collection: OpenCollection): AmountDraft {
  return {
    cashAmount: collection.openCashAmount.toFixed(2),
    chequeAmount: collection.openChequeAmount.toFixed(2),
  };
}

// A new credit is banked as cash for its full amount.
export function defaultCreditDraft(credit: BankCredit): CreditDraft {
  return { medium: "cash", cashAmount: credit.amount.toFixed(2), chequeAmount: "" };
}

// Switching medium fills the amounts the new medium implies. Both keeps what was typed in Both.
export function creditDraftForMedium(credit: BankCredit, medium: BankingMedium, current: CreditDraft): CreditDraft {
  if (medium === "cash") return { medium, cashAmount: credit.amount.toFixed(2), chequeAmount: "" };
  if (medium === "cheque") return { medium, cashAmount: "", chequeAmount: credit.amount.toFixed(2) };
  const keep = current.medium === "mixed";
  return {
    medium,
    cashAmount: keep ? current.cashAmount : credit.amount.toFixed(2),
    chequeAmount: keep ? current.chequeAmount : "",
  };
}

export function filterCredits<T extends BankCredit>(credits: readonly T[], search: string): T[] {
  const term = search.trim().toLowerCase();
  if (term === "") return [...credits];
  return credits.filter((credit) =>
    [credit.description, credit.category, credit.notes]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase()
      .includes(term)
  );
}

export function hasEnoughNote(text: string): boolean {
  return text.trim().length >= MIN_NOTE_LENGTH;
}

type CollectionResult = { split: CollectionSplit } | { error: string };

// One collection's cash and cheque amounts, checked against what is still open on it.
// Comparisons run in pence so a float that is a hair over the open amount is not flagged.
function collectionSplitFor(collection: OpenCollection, amounts: AmountDraft): CollectionResult {
  const label = shortDate(collection.weekEndingDate);
  const cash = parseAmountInput(amounts.cashAmount);
  const cheque = parseAmountInput(amounts.chequeAmount);

  if (cash === undefined || cheque === undefined) {
    return { error: `Enter valid cash and cheque amounts for ${label}.` };
  }
  if (cash < 0 || cheque < 0) {
    return { error: `Collection split amounts cannot be negative for ${label}.` };
  }
  if (toPence(cash) > toPence(collection.openCashAmount)) {
    return { error: `Cash split for ${label} cannot exceed the open cash amount.` };
  }
  if (toPence(cheque) > toPence(collection.openChequeAmount)) {
    return { error: `Cheque split for ${label} cannot exceed the open cheque amount.` };
  }
  if (toPence(cash) + toPence(cheque) <= 0) {
    return { error: `Enter a cash or cheque amount greater than zero for ${label}.` };
  }

  return {
    split: {
      cashCollectionId: collection._id,
      cashAmount: roundMoney(cash),
      chequeAmount: roundMoney(cheque),
    },
  };
}

function bankInputFor(credit: BankCredit, draft: CreditDraft): BankTransactionSplitInput {
  const mixed = draft.medium === "mixed";
  return {
    transactionId: credit._id,
    transactionAmount: credit.amount,
    medium: draft.medium,
    cashAmount: mixed ? parseAmountInput(draft.cashAmount) : undefined,
    chequeAmount: mixed ? parseAmountInput(draft.chequeAmount) : undefined,
  };
}

type CreditResult = { split: BankTransactionSplit } | { error: string };

// The server's own rules, reused one credit at a time so each message lands on its row.
function creditSplitFor(input: BankTransactionSplitInput): CreditResult {
  if (input.medium === "mixed" && (input.cashAmount === undefined || input.chequeAmount === undefined)) {
    return { error: "Enter both the cash and cheque amounts." };
  }
  try {
    const [split] = normalizeBankTransactionSplits([input]);
    return { split };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Bank split amounts are invalid." };
  }
}

export interface BankingView {
  collectionSplits: CollectionSplit[];
  collectionErrors: Record<string, string>;
  // Per collection, cash plus cheques, for the receipt. Only collections whose amounts are valid.
  collectionTotals: Record<string, number>;
  bankInputs: BankTransactionSplitInput[];
  bankSplits: BankTransactionSplit[];
  creditErrors: Record<string, string>;
  counted: number;
  banked: number;
  // Banked minus counted. Null while any amount is invalid, so the difference is never shown half-true.
  variance: number | null;
}

// Everything the walkthrough shows or saves, derived from the ticked collections and credits.
export function buildBankingView({
  collections,
  overrides,
  credits,
  creditDrafts,
}: {
  collections: readonly OpenCollection[];
  overrides: Record<string, AmountDraft>;
  credits: readonly BankCredit[];
  creditDrafts: Record<string, CreditDraft>;
}): BankingView {
  const collectionSplits: CollectionSplit[] = [];
  const collectionErrors: Record<string, string> = {};
  const collectionTotals: Record<string, number> = {};

  for (const collection of collections) {
    const result = collectionSplitFor(collection, overrides[collection._id] ?? defaultCollectionAmounts(collection));
    if ("error" in result) {
      collectionErrors[collection._id] = result.error;
    } else {
      collectionSplits.push(result.split);
      collectionTotals[collection._id] = roundMoney(result.split.cashAmount + result.split.chequeAmount);
    }
  }

  const bankInputs = credits.map((credit) =>
    bankInputFor(credit, creditDrafts[credit._id] ?? defaultCreditDraft(credit))
  );
  const bankSplits: BankTransactionSplit[] = [];
  const creditErrors: Record<string, string> = {};

  for (const input of bankInputs) {
    const result = creditSplitFor(input);
    if ("error" in result) creditErrors[input.transactionId] = result.error;
    else bankSplits.push(result.split);
  }

  const counted = sumMoney(collectionSplits, (split) => split.cashAmount + split.chequeAmount);
  const banked = sumMoney(bankSplits, (split) => split.cashAmount + split.chequeAmount);
  const anyError = Object.keys(collectionErrors).length > 0 || Object.keys(creditErrors).length > 0;
  const variance = anyError
    ? null
    : calculateReconciliationSummary({ collectionSplits, bankTransactionSplits: bankSplits }).varianceAmount;

  return {
    collectionSplits,
    collectionErrors,
    collectionTotals,
    bankInputs,
    bankSplits,
    creditErrors,
    counted,
    banked,
    variance,
  };
}
