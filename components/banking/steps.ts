import { toPence } from "../../lib/reconciliation";
import type { RailStepState } from "../wizard/RailStep";
import { hasEnoughNote } from "./draft";

// The rail order. Done is the last rail item, reached only once the banking is completed.
export const RAIL_ORDER = ["collections", "bank", "check", "done"] as const;

export type BankingStepKind = (typeof RAIL_ORDER)[number];

// Once the walkthrough reaches done, every step on the rail counts as finished.
export function railStateFor(kind: BankingStepKind, current: BankingStepKind): RailStepState {
  if (current === "done") return "done";
  const at = RAIL_ORDER.indexOf(kind);
  const now = RAIL_ORDER.indexOf(current);
  return at < now ? "done" : at === now ? "now" : "todo";
}

// Done is only shown after a successful completion. Any other request for it opens the first step.
export function resolveStep(position: BankingStepKind | null, completed: boolean): BankingStepKind {
  if (position === "done") return completed ? "done" : "collections";
  return position ?? "collections";
}

export function previousStepFor(step: BankingStepKind): BankingStepKind | undefined {
  if (step === "collections" || step === "done") return undefined;
  return RAIL_ORDER[RAIL_ORDER.indexOf(step) - 1];
}

export interface StepFacts {
  selectedCollections: number;
  collectionErrors: number;
  selectedCredits: number;
  creditErrors: number;
  // Null while an amount is invalid.
  variance: number | null;
  varianceType: string;
  varianceNote: string;
}

// Whether the walkthrough may move past a step. The check step is also the completion gate, so it
// needs the whole deposit to be valid, not just its own variance reason.
export function stepReady(step: BankingStepKind, facts: StepFacts): boolean {
  switch (step) {
    case "collections":
      return facts.selectedCollections > 0 && facts.collectionErrors === 0;
    case "bank":
      return facts.selectedCredits > 0 && facts.creditErrors === 0;
    case "check": {
      const whole =
        facts.selectedCollections > 0 && facts.selectedCredits > 0 && facts.collectionErrors === 0 && facts.creditErrors === 0;
      if (!whole || facts.variance === null) return false;
      if (toPence(facts.variance) === 0) return true;
      return facts.varianceType !== "" && hasEnoughNote(facts.varianceNote);
    }
    case "done":
      return false;
  }
}
