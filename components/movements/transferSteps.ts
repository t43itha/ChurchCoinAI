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
