import { gbp } from "../cashEntry/format";
import { signedGbp } from "../statementImport/format";

// "−£10.00" when the bank shows less, "+£10.00" when it shows more, "£0.00" when they agree, "—" while unknown.
export const differenceText = (variance: number | null) => {
  if (variance === null) return "—";
  return variance === 0 ? gbp(0) : signedGbp(variance);
};

// "1 collection", "3 collections".
export const countLabel = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Mon 14 Sep 2026". Written out, because en-GB abbreviates September as "Sept".
export function historyDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// "2 collections · counted £150.00 · £30.00 short". The variance part only appears when banked and counted differ.
export function historyDetail(record: { cashCollectionIds: readonly unknown[]; expectedTotal: number; varianceAmount: number }) {
  const parts = [countLabel(record.cashCollectionIds.length, "collection"), `counted ${gbp(record.expectedTotal)}`];
  if (record.varianceAmount !== 0) {
    parts.push(`${gbp(Math.abs(record.varianceAmount))} ${record.varianceAmount < 0 ? "short" : "over"}`);
  }
  return parts.join(" · ");
}
