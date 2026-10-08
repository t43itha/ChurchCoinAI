// The one-sentence summary at the top of a report, built from its figures. No AI:
// the same numbers always give the same sentence.

export type HeadlineMover = {
  name: string;
  change: number | null; // percent
};

export type HeadlineInput = {
  kind: "month" | "year";
  // False while the period is still in progress ("so far").
  isComplete: boolean;
  net: number;
  incomeChange: number | null; // percent vs comparison
  expenditureChange: number | null;
  // "August", "the same months last year".
  comparisonLabel: string;
  // Largest absolute change among categories with a comparison, if any moved 10%+.
  incomeMover?: HeadlineMover;
  expenditureMover?: HeadlineMover;
  missionTitheDue?: number;
  giftAidClaimable?: number;
  reserveCoverMonths?: number | null;
};

export type HeadlineTone = "surplus" | "deficit" | "breakeven";

export type Headline = {
  tone: HeadlineTone;
  // Short badge text: "Surplus", "Deficit", "Break-even".
  status: string;
  // Emphasised opening: "A £1,860 surplus".
  lead: string;
  // The rest of the sentence(s), starting with ". " or " so far. ".
  rest: string;
};

export function buildHeadline(input: HeadlineInput): Headline {
  throw new Error("not implemented");
}

export function pickMover(
  rows: Array<{ mainCategory: string; total: number; previous?: number }>
): HeadlineMover | undefined {
  throw new Error("not implemented");
}
