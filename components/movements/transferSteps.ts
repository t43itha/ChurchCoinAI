import { parseBalance, toPence } from "../../lib/reconciliation";
import type { RailStepState } from "../wizard/RailStep";

// The rail, in order. Done is the confirmation and is shown on the rail too.
export const TRANSFER_STEPS = ["funds", "amount", "done"] as const;
export type TransferStep = (typeof TRANSFER_STEPS)[number];

export function railStateFor(kind: TransferStep, current: TransferStep): RailStepState {
  const at = TRANSFER_STEPS.indexOf(kind);
  const now = TRANSFER_STEPS.indexOf(current);
  return at < now ? "done" : at === now ? "now" : "todo";
}

// Only the amount step goes back to the funds. Done is left through its own buttons.
export function previousStepFor(step: TransferStep): TransferStep | undefined {
  return step === "amount" ? "funds" : undefined;
}

// The amount typed in the box, in pence. Null unless it is above zero with at most two decimals.
export function amountPence(text: string): number | null {
  const pounds = parseBalance(text);
  return pounds === null || pounds <= 0 ? null : toPence(pounds);
}

// A fund's balance after a change of this many pence (negative takes money out).
export function balanceAfterPence(fundBalance: number, changePence: number): number {
  return toPence(fundBalance) + changePence;
}

export interface TransferDraft {
  fromFundId: string;
  toFundId: string;
  amountText: string;
  date: string;
  note: string;
}

export interface MovedSummary {
  fromName: string;
  toName: string;
  amountPence: number;
}

export interface TransferState {
  position: TransferStep;
  draft: TransferDraft;
  moved: MovedSummary | null;
}

export interface TransferStart {
  today: string;
  fromFundId?: string;
  toFundId?: string;
  amount?: number;
  step?: TransferStep;
}

// A fresh walkthrough. Prefilled funds and amount sit in the draft, so they count as unsaved work.
export function startTransfer({ today, fromFundId = "", toFundId = "", amount, step = "funds" }: TransferStart): TransferState {
  return {
    position: step,
    draft: { fromFundId, toFundId, amountText: amount === undefined ? "" : amount.toFixed(2), date: today, note: "" },
    moved: null,
  };
}

export type TransferAction =
  | { type: "edit"; patch: Partial<TransferDraft> }
  | { type: "go"; step: TransferStep }
  | { type: "moved"; summary: MovedSummary }
  | { type: "moreMoney"; today: string };

export function transferReducer(state: TransferState, action: TransferAction): TransferState {
  switch (action.type) {
    case "edit":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "go":
      return { ...state, position: action.step };
    case "moved":
      return { ...state, moved: action.summary, position: "done" };
    case "moreMoney":
      return startTransfer({ today: action.today });
  }
}

// Anything picked, typed or dated away from today since the walkthrough opened. A saved transfer has nothing left to lose.
export function hasUnsavedTransfer(state: TransferState, today: string): boolean {
  const { draft } = state;
  return (
    !state.moved &&
    (draft.fromFundId !== "" ||
      draft.toFundId !== "" ||
      draft.amountText.trim() !== "" ||
      draft.note.trim() !== "" ||
      draft.date !== today)
  );
}

// Closing asks before discarding unsaved work. Escape and the close button both go through this.
export function mayCloseTransfer(
  state: TransferState,
  today: string,
  saving: boolean,
  askToDiscard: () => boolean
): boolean {
  if (saving) return false;
  return !hasUnsavedTransfer(state, today) || askToDiscard();
}
