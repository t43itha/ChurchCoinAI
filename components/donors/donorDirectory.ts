import { CATEGORY_ALIASES } from "../../constants/rciCategories";
import { roundMoney, sumMoney } from "../../convex/lib/money";
import { isGiftAidGivingCategory } from "../../lib/dashboardKpis";
import { isPledgeBehind } from "../../lib/pledgeProgress";
import { filterIncomeAndExpenditure } from "../../lib/reportableTransactions";
import type { Donor, Pledge, Transaction } from "../../types";

const DAY_MS = 86_400_000;
// Gifts older than this count as stopped giving.
export const LAPSED_DAYS = 60;

export type DonorFilter = "everyone" | "noGiftAid" | "pledgesBehind" | "stoppedGiving";

export interface GivingStat {
  // Pounds given this year.
  ytd: number;
  // Epoch ms of the latest gift, or 0 when there is none.
  lastGift: number;
}

const NO_GIVING: GivingStat = { ytd: 0, lastGift: 0 };

// Transactions can carry a donor id, a donor name, or both, so each gift counts under both keys.
export function givingStats(transactions: Transaction[], year: number): Map<string, GivingStat> {
  const yearRows = new Map<string, Transaction[]>();
  const lastGift = new Map<string, number>();
  for (const transaction of filterIncomeAndExpenditure(transactions)) {
    if (transaction.type !== "Income") continue;
    const time = new Date(transaction.date).getTime();
    const inYear = new Date(transaction.date).getFullYear() === year;
    for (const key of [transaction.donorId, transaction.donorName].filter(Boolean) as string[]) {
      if (time > (lastGift.get(key) ?? 0)) lastGift.set(key, time);
      if (!inYear) continue;
      const rows = yearRows.get(key) ?? [];
      rows.push(transaction);
      yearRows.set(key, rows);
    }
  }
  const keys = new Set([...lastGift.keys(), ...yearRows.keys()]);
  return new Map(
    [...keys].map((key) => [
      key,
      { ytd: sumMoney(yearRows.get(key) ?? [], (row) => row.amount), lastGift: lastGift.get(key) ?? 0 },
    ])
  );
}

export const statFor = (stats: Map<string, GivingStat>, donor: Donor): GivingStat =>
  stats.get(donor._id) ?? stats.get(donor.name) ?? NO_GIVING;

// The first active schedule per donor, matched by id or name like the giving stats.
export function activeScheduleMap(pledges: Pledge[]): Map<string, Pledge> {
  const schedules = new Map<string, Pledge>();
  for (const pledge of pledges) {
    if (pledge.status !== "Active") continue;
    for (const key of [pledge.donorId, pledge.donorName].filter(Boolean) as string[]) {
      if (!schedules.has(key)) schedules.set(key, pledge);
    }
  }
  return schedules;
}

export const scheduleFor = (schedules: Map<string, Pledge>, donor: Donor) =>
  schedules.get(donor._id) ?? schedules.get(donor.name);

export const isLapsed = (lastGift: number, now: number) => lastGift > 0 && lastGift < now - LAPSED_DAYS * DAY_MS;

// Gift Aid pill state. Null when the church has Gift Aid switched off, so nothing is shown.
export function giftAidState(donor: Donor, giftAidEnabled: boolean): "on" | "missing" | null {
  if (!giftAidEnabled) return null;
  return donor.isGiftAidActive ? "on" : "missing";
}

// HMRC refunds 25% of an eligible gift to the charity.
export const giftAidClaimable = (pounds: number) => roundMoney(pounds * 0.25);

const isUncategorised = (category: string) =>
  !category || (CATEGORY_ALIASES[category] ?? category) === "Uncategorised";

// What a missing declaration would reclaim this year, counted the way the dashboard counts giving
// (income in the giving categories). `claimable` is null while any gift this year is uncategorised,
// because that gift may be giving too and the figure would understate it.
export function undeclaredGiftAid(yearIncome: Transaction[]): { giving: number; claimable: number | null } {
  const giving = sumMoney(
    yearIncome.filter((transaction) => isGiftAidGivingCategory(transaction.category)),
    (transaction) => transaction.amount
  );
  const fullyCategorised = yearIncome.every((transaction) => !isUncategorised(transaction.category));
  return { giving, claimable: fullyCategorised ? giftAidClaimable(giving) : null };
}

// Donors with at least one active recurring schedule that has fallen behind, matched by id or
// name like the schedules. Pass the ledger rows; voided rows and journal legs are dropped here.
export function donorsWithPledgesBehind(
  donors: Donor[],
  pledges: Pledge[],
  transactions: Transaction[],
  today: string
): Set<string> {
  const payments = filterIncomeAndExpenditure(transactions);
  const behind = new Set<string>();
  for (const donor of donors) {
    const mine = pledges.filter((pledge) => pledge.donorId === donor._id || pledge.donorName === donor.name);
    if (mine.some((pledge) => isPledgeBehind(pledge, payments, today))) behind.add(donor._id);
  }
  return behind;
}

export function filterDonors(
  donors: Donor[],
  options: {
    search: string;
    filter: DonorFilter;
    stats: Map<string, GivingStat>;
    giftAidEnabled: boolean;
    now: number;
    pledgesBehind: Set<string>;
  }
): Donor[] {
  const query = options.search.toLowerCase();
  return donors.filter((donor) => {
    if (!donor.name.toLowerCase().includes(query)) return false;
    if (options.filter === "noGiftAid") return giftAidState(donor, options.giftAidEnabled) === "missing";
    if (options.filter === "pledgesBehind") return options.pledgesBehind.has(donor._id);
    if (options.filter === "stoppedGiving") {
      return isLapsed(statFor(options.stats, donor).lastGift, options.now);
    }
    return true;
  });
}

export function filterCounts(
  donors: Donor[],
  stats: Map<string, GivingStat>,
  giftAidEnabled: boolean,
  now: number,
  pledgesBehind: Set<string>
): Record<DonorFilter, number> {
  return {
    everyone: donors.length,
    noGiftAid: donors.filter((donor) => giftAidState(donor, giftAidEnabled) === "missing").length,
    pledgesBehind: donors.filter((donor) => pledgesBehind.has(donor._id)).length,
    stoppedGiving: donors.filter((donor) => isLapsed(statFor(stats, donor).lastGift, now)).length,
  };
}

// Directory sections, one per initial. Names without a letter fall under "#".
export function groupByInitial(donors: Donor[]): Array<{ letter: string; donors: Donor[] }> {
  const groups: Array<{ letter: string; donors: Donor[] }> = [];
  for (const donor of donors) {
    const first = donor.name.trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    const group = groups.find((candidate) => candidate.letter === letter);
    if (group) group.donors.push(donor);
    else groups.push({ letter, donors: [donor] });
  }
  return groups;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

// "4 Oct", or "4 Oct 2024" for a gift from an earlier year.
export function shortGiftDate(time: number, now: number): string {
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? SHORT_DATE : SHORT_DATE_WITH_YEAR).format(new Date(time));
}

export const formatPounds = (pounds: number) =>
  `£${pounds.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Digits only, with a UK leading 0 swapped for the 44 country code wa.me expects.
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
}
