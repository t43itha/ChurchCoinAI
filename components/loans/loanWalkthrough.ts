import type { FunctionArgs } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { linkState, movementProblem, summarizeLoan, type MovementLeg } from "../../lib/movementMatching";

// The rail order. "done" is the finish screen and is never shown on the rail.
export const LOAN_RAIL_ORDER = ["who", "amount", "repayments"] as const;
export type LoanStepKind = (typeof LOAN_RAIL_ORDER)[number] | "done";

export interface LoanValues {
  lender: string;
  dueDate: string;
  note: string;
}

export type LinkLoanArgs = FunctionArgs<typeof api.mutations.movements.link>;

// A loan leg waiting to be linked, of the given direction: Income is money received, Expenditure a repayment.
const waitingLoanLegs = <T extends MovementLeg>(transactions: T[], type: MovementLeg["type"]): T[] =>
  transactions.filter((leg) => {
    const state = linkState(leg);
    return state.status === "waiting" && state.kind === "loan" && leg.type === type;
  });

// The money received that can start a loan: marked as a loan, received, and not yet linked.
export const receivedCandidates = <T extends MovementLeg>(transactions: T[]): T[] =>
  waitingLoanLegs(transactions, "Income");

// Repayments waiting to be linked to a loan.
export const repaymentCandidates = <T extends MovementLeg>(transactions: T[]): T[] =>
  waitingLoanLegs(transactions, "Expenditure");

export const whoIsReady = (values: LoanValues) => values.lender.trim() !== "";

// Null when the received money and the chosen repayments make a complete loan.
export function loanProblem(received: MovementLeg | undefined, repayments: MovementLeg[]): string | null {
  if (!received) return "Choose the money received.";
  return movementProblem("loan", [received, ...repayments]);
}

// The loan as it will stand once recorded, for the receipt and the done screen.
export function loanSummary(received: MovementLeg, repayments: MovementLeg[]) {
  return summarizeLoan([received, ...repayments]);
}

// Arguments for the existing link mutation: no movementId, so it creates the loan.
export function newLoanArgs(values: LoanValues, received: MovementLeg, repayments: MovementLeg[]): LinkLoanArgs {
  return {
    transactionIds: [received, ...repayments].map((leg) => leg._id as Id<"transactions">),
    lender: values.lender.trim(),
    dueDate: values.dueDate || undefined,
    note: values.note.trim() || undefined,
  };
}
