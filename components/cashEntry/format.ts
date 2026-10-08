import { sumMoney } from "../../convex/lib/money";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import {
  COIN_KEYS,
  NOTE_VALUES,
  countTotal,
  parseAmount,
  type CashCount,
} from "../../lib/cashCollectionDraft";

const parseDate = (iso: string) => new Date(`${iso}T00:00:00`);

export const gbp = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value || 0);

// "Fri 2 Oct"
export const shortDate = (iso: string) =>
  parseDate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// "2 Oct"
export const dayMonth = (iso: string) =>
  parseDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// "Sunday 4 October"
export const longDate = (iso: string) =>
  parseDate(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

// "Mon 28 Sep – Sun 4 Oct", for a week ending on the given Sunday
export function weekRange(weekEndingDate: string) {
  const start = parseDate(weekEndingDate);
  start.setDate(start.getDate() - 6);
  return `${shortDate(formatLocalDateInputValue(start))} – ${shortDate(weekEndingDate)}`;
}

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function noteCountOf(count: CashCount) {
  let total = 0;
  for (const value of NOTE_VALUES) total += count.notes[value] ?? 0;
  return total;
}

export const coinsValueOf = (count: CashCount) =>
  sumMoney(COIN_KEYS, (key) => parseAmount(count.coins[key] ?? ""));

export const notesValueOf = (count: CashCount) => countTotal({ notes: count.notes, coins: {} });
