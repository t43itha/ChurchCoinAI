import type { CollectionDraft } from "../../lib/cashCollectionDraft";

export type WizardStep =
  | { kind: "start" }
  | { kind: "giving"; serviceIndex: number }
  | { kind: "tithes"; serviceIndex: number }
  | { kind: "review" }
  | { kind: "done" };

// Start, then giving and tithes for each service in order, then review and done.
export function buildSteps(draft: CollectionDraft): WizardStep[] {
  return [
    { kind: "start" },
    ...draft.services.flatMap((_, serviceIndex): WizardStep[] => [
      { kind: "giving", serviceIndex },
      { kind: "tithes", serviceIndex },
    ]),
    { kind: "review" },
    { kind: "done" },
  ];
}

export const stepIndexOfGiving = (steps: WizardStep[], serviceIndex: number) =>
  steps.findIndex((step) => step.kind === "giving" && step.serviceIndex === serviceIndex);
