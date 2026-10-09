import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { meetsMoneyTarget } from "../../convex/lib/money";
import type { RailStepState } from "../wizard/RailStep";

// The rail, in order. Done is the confirmation.
export const LINK_STEPS = ["match", "done"] as const;
export type LinkStep = (typeof LINK_STEPS)[number];

export function railStateFor(kind: LinkStep, current: LinkStep): RailStepState {
  const at = LINK_STEPS.indexOf(kind);
  const now = LINK_STEPS.indexOf(current);
  return at < now ? "done" : at === now ? "now" : "todo";
}

export type LinkArgs = FunctionArgs<typeof api.mutations.movements.link>;
export type Loan = FunctionReturnType<typeof api.queries.movements.listLoans>[number];

export const money = (amount: number) => `£${amount.toFixed(2)}`;

// The loans a repayment of this amount can go to: still open, and owing at least the amount.
export function openLoansFor(loans: Loan[], amount: number): Loan[] {
  return loans.filter((loan) => !loan.isRepaid && meetsMoneyTarget(loan.outstanding, amount));
}

// What the link was made to, as the done step describes it. Each form reports the one it chose.
export type LinkedWith =
  | { kind: "transaction"; description: string; amount: number }
  | { kind: "new-loan"; lender: string }
  | { kind: "loan"; lender: string; received: boolean };

export function linkedSummary(linkedWith: LinkedWith): string {
  switch (linkedWith.kind) {
    case "transaction":
      return `Linked to ${linkedWith.description}, ${money(linkedWith.amount)}.`;
    case "new-loan":
      return `Recorded as a new loan from ${linkedWith.lender}.`;
    case "loan":
      return linkedWith.received
        ? `Added to the loan from ${linkedWith.lender}.`
        : `Recorded as a repayment of the loan from ${linkedWith.lender}.`;
  }
}
