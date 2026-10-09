// The one-sentence summary at the top of a report, built from its figures. No AI:
// the same numbers always give the same sentence.
import { percentChange } from "./reportSummary";

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

const MIN_MOVER_CHANGE = 10;
const MIN_MOVER_POUNDS = 1;

const moneyFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const formatMoney = (amount: number) => moneyFormat.format(Math.abs(amount));

const wholePercent = (percent: number) => Math.round(Math.abs(percent));

const capitalise = (sentence: string) => sentence.charAt(0).toUpperCase() + sentence.slice(1);

// "mostly X" only explains a real move in the same direction as the total.
function moverPhrase(change: number, mover?: HeadlineMover): string {
  if (!mover || mover.change === null || Math.abs(change) < 1) return "";
  return Math.sign(mover.change) === Math.sign(change) ? `, mostly ${mover.name}` : "";
}

function incomeSentence(input: HeadlineInput, hasExpenditureSentence: boolean): string | null {
  const change = input.incomeChange;
  if (change === null) return null;
  const verb = input.kind === "year" && !input.isComplete ? "is" : "was";
  let phrase: string;
  if (Math.abs(change) < 1) phrase = `level with ${input.comparisonLabel}`;
  else {
    const direction = change > 0 ? "up" : "down";
    phrase = `${direction} ${wholePercent(change)}% on ${input.comparisonLabel}`;
  }
  const mover = moverPhrase(change, input.incomeMover);
  return `Income ${verb} ${phrase}${mover}${hasExpenditureSentence ? ";" : "."}`;
}

// Lower case: the caller capitalises it when it opens the headline.
function expenditureSentence(input: HeadlineInput): string | null {
  const change = input.expenditureChange;
  if (change === null) return null;
  let phrase: string;
  if (Math.abs(change) < 1) phrase = "held steady";
  else phrase = `${change > 0 ? "rose" : "fell"} ${wholePercent(change)}%`;
  const mover = moverPhrase(change, input.expenditureMover);
  return `spending ${phrase}${mover}.`;
}

function obligationsSentence(input: HeadlineInput): string | null {
  const parts: string[] = [];
  const tithe = input.missionTitheDue ?? 0;
  const giftAid = input.giftAidClaimable ?? 0;
  if (tithe > 0) parts.push(`${formatMoney(tithe)} mission tithe is due`);
  if (giftAid > 0) parts.push(`${formatMoney(giftAid)} of Gift Aid can be claimed`);
  if (parts.length === 0) return null;
  return `${capitalise(parts.join(" and "))}.`;
}

function reserveSentence(months: number): string {
  const unit = months === 1 ? "month" : "months";
  return `General fund reserves would cover ${months} ${unit} of running costs.`;
}

export function buildHeadline(input: HeadlineInput): Headline {
  let tone: HeadlineTone;
  let status: string;
  let lead: string;
  if (Math.abs(input.net) < 0.5) {
    tone = "breakeven";
    status = "Break-even";
    lead = "Income and spending broke even";
  } else if (input.net > 0) {
    tone = "surplus";
    status = "Surplus";
    lead = `A ${formatMoney(input.net)} surplus`;
  } else {
    tone = "deficit";
    status = "Deficit";
    lead = `A ${formatMoney(input.net)} deficit`;
  }

  const expenditure = expenditureSentence(input);
  const income = incomeSentence(input, expenditure !== null);
  const sentences: string[] = [];
  if (income) sentences.push(income);
  if (expenditure) sentences.push(income ? expenditure : capitalise(expenditure));

  if (input.kind === "month") {
    const obligations = obligationsSentence(input);
    if (obligations) sentences.push(obligations);
  } else if (typeof input.reserveCoverMonths === "number") {
    sentences.push(reserveSentence(input.reserveCoverMonths));
  }

  const prefix = input.isComplete ? ". " : " so far. ";
  const rest = sentences.length > 0 ? prefix + sentences.join(" ") : prefix.trimEnd();
  return { tone, status, lead, rest };
}

// The category that moved most against the comparison period: among rows with a
// comparison above zero, moves of at least 10% and £1 (absolute), the largest
// in pounds. Undefined when nothing moved enough.
export function pickMover(
  rows: Array<{ mainCategory: string; total: number; previous?: number }>
): HeadlineMover | undefined {
  let best: { mover: HeadlineMover; pounds: number } | undefined;
  for (const row of rows) {
    if (row.previous === undefined || row.previous <= 0) continue;
    const change = percentChange(row.total, row.previous);
    const pounds = Math.abs(row.total - row.previous);
    if (change === null || Math.abs(change) < MIN_MOVER_CHANGE || pounds < MIN_MOVER_POUNDS) continue;
    if (!best || pounds > best.pounds) {
      best = { mover: { name: row.mainCategory, change }, pounds };
    }
  }
  return best?.mover;
}
