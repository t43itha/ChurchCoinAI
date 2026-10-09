import { sumMoney } from "../../convex/lib/money";
import { isPledgeBehind, type PledgeFrequency } from "../../lib/pledgeProgress";
import { toPence } from "../../lib/reconciliation";
import { FundType, type Fund, type FundCreateInput, type Pledge, type PledgeCreateInput, type Transaction } from "../../types";
import type { RailStepState } from "../wizard/RailStep";

export const PLEDGE_FREQUENCIES = ["One-off", "Weekly", "Monthly", "Annual"] as const;

export type PledgeTag = "paid" | "behind" | "onTrack" | "cancelled";

export const PLEDGE_TAG_LABEL: Record<PledgeTag, string> = {
  paid: "Paid ✓",
  behind: "Behind",
  onTrack: "On track",
  cancelled: "Cancelled",
};

const DAY_MS = 86_400_000;

const wholePounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

// "£38,200", for the hero and pledge rows.
export const formatWholePounds = (value: number) => wholePounds.format(value || 0);

// Whole days from `today` to an ISO date. Negative once the date has passed.
export function daysUntil(isoDate: string, today: string): number {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

// "31 January", for the campaign status line.
export function longDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

// Campaigns that have not passed their end date. A campaign with no end date stays open.
export function isOpenCampaign(fund: Fund, today: string): boolean {
  return !fund.deadline || daysUntil(fund.deadline, today) >= 0;
}

// "Ends 31 January · 115 days left", for the page header.
export function endsLabel(fund: Fund, today: string): string {
  if (!fund.deadline) return "No end date set";
  const days = daysUntil(fund.deadline, today);
  if (days < 0) return `Ended ${longDay(fund.deadline)}`;
  if (days === 0) return "Ends today";
  return `Ends ${longDay(fund.deadline)} · ${days === 1 ? "1 day" : `${days} days`} left`;
}

// The campaign's bar, in pence so the three parts always add back to the target.
// Received is capped at the target; pledges still to come fill what is left, and the rest is to find.
export function campaignSplit(targetPounds: number, collectedPounds: number, outstandingPence: number) {
  const targetPence = Math.max(toPence(targetPounds), 0);
  const receivedPence = Math.min(Math.max(toPence(collectedPounds), 0), targetPence);
  const pledgedPence = Math.min(Math.max(outstandingPence, 0), targetPence - receivedPence);
  const toFindPence = targetPence - receivedPence - pledgedPence;
  return { received: receivedPence / 100, pledged: pledgedPence / 100, toFind: toFindPence / 100 };
}

// What an active pledge still owes, in pence. Completed and cancelled pledges owe nothing.
export function pledgeOutstandingPence(pledge: Pick<Pledge, "amount" | "status">, receivedPounds: number): number {
  if (pledge.status !== "Active") return 0;
  return Math.max(toPence(pledge.amount) - toPence(receivedPounds), 0);
}

export function pledgeTag(pledge: Pledge, incomeRows: Transaction[], today: string): PledgeTag {
  if (pledge.status === "Completed") return "paid";
  if (pledge.status === "Cancelled") return "cancelled";
  return isPledgeBehind(pledge, incomeRows, today) ? "behind" : "onTrack";
}

export function receivedOn(payments: { amount: number }[]): number {
  return sumMoney(payments, (payment) => payment.amount);
}

export function latestDate(payments: { date: string }[]): string | undefined {
  return payments.reduce<string | undefined>((latest, payment) => (!latest || payment.date > latest ? payment.date : latest), undefined);
}

// "JR" for "James & Ruth Bailey": the first letter of the first two words, skipping symbols.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// State of one rail row in a walkthrough. `current` is the index of the step on screen; a value
// past the last step (the Done screen) marks every row as finished.
export function railState(index: number, current: number): RailStepState {
  if (index < current) return "done";
  return index === current ? "now" : "todo";
}

export type PledgeForm = {
  donorName: string;
  donorId?: string;
  amount: string;
  frequency: PledgeFrequency;
  startDate: string;
  endDate: string;
};

export const pledgeFormReady = (form: PledgeForm) => form.donorName.trim() !== "";

export const pledgeAmount = (form: PledgeForm) => Number(form.amount);

export const pledgeAmountReady = (form: PledgeForm) => {
  const amount = pledgeAmount(form);
  return Number.isFinite(amount) && amount > 0;
};

// A new pledge matches an existing donor by name when the walkthrough did not pick one.
export function buildPledgeInput(
  form: PledgeForm,
  { fundId, donors, today }: { fundId: string; donors: { _id: string; name: string }[]; today: string }
): PledgeCreateInput {
  const donorName = form.donorName.trim();
  const existing = donors.find((donor) => donor.name.toLowerCase() === donorName.toLowerCase());
  return {
    donorName,
    donorId: form.donorId ?? existing?._id,
    amount: pledgeAmount(form),
    fundId,
    frequency: form.frequency,
    startDate: form.startDate || today,
    endDate: form.endDate || undefined,
    status: "Active",
  };
}

export type NewCampaignForm = { name: string; target: string; endDate: string; description: string };

export const campaignNameReady = (form: NewCampaignForm) => form.name.trim() !== "";

// The target is optional, but if it is typed it has to be an amount above zero.
export const campaignTargetReady = (form: NewCampaignForm) => {
  if (form.target.trim() === "") return true;
  const target = Number(form.target);
  return Number.isFinite(target) && target > 0;
};

// Campaigns are Restricted funds; the target and end date are the fund's own fields.
export function buildCampaignFund(form: NewCampaignForm): FundCreateInput {
  return {
    name: form.name.trim(),
    type: FundType.RESTRICTED,
    description: form.description.trim() || undefined,
    targetAmount: form.target.trim() === "" ? undefined : Number(form.target),
    deadline: form.endDate || undefined,
  };
}

// Builds a wa.me link. UK numbers written with a leading 0 get the 44 country code.
export function whatsAppUrl(phone: string, text: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  const international = digits.startsWith("0") ? `44${digits.substring(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}
