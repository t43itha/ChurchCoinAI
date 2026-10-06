import { roundMoney, meetsMoneyTarget } from "../convex/lib/money";

export type PledgeFrequency = "One-off" | "Weekly" | "Monthly" | "Annual";

const parseIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

export const countPledgeInstalments = (
  frequency: Exclude<PledgeFrequency, "One-off">,
  startDate: string,
  endDate: string
) => {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 1;

  if (frequency === "Weekly") {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    return Math.floor(days / 7) + 1;
  }

  if (frequency === "Monthly") {
    return (
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1
    );
  }

  return end.getUTCFullYear() - start.getUTCFullYear() + 1;
};

// One-off pledges complete when the single amount is received. Recurring
// pledges complete only once an end date is set and every instalment in that
// window has been received. An open-ended recurring pledge stays active.
export const pledgeFulfillmentTarget = (pledge: {
  amount: number;
  frequency: PledgeFrequency;
  startDate: string;
  endDate?: string;
}): number | null => {
  if (pledge.frequency === "One-off") return roundMoney(pledge.amount);
  if (!pledge.endDate) return null;
  return roundMoney(
    pledge.amount *
      countPledgeInstalments(pledge.frequency, pledge.startDate, pledge.endDate)
  );
};

// Null means a receipt must not change the stored status: the pledge is
// cancelled, explicitly completed, or open-ended.
export const automaticPledgeStatus = (
  pledge: {
    status: "Active" | "Completed" | "Cancelled";
    completionOverride?: boolean;
    amount: number;
    frequency: PledgeFrequency;
    startDate: string;
    endDate?: string;
  },
  totalReceived: number
): "Active" | "Completed" | null => {
  if (pledge.status === "Cancelled") return null;
  if (pledge.completionOverride && pledge.status === "Completed") return null;
  const target = pledgeFulfillmentTarget(pledge);
  if (target === null) return null;
  return meetsMoneyTarget(totalReceived, target) ? "Completed" : "Active";
};
