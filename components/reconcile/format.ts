import { dayMonth } from "../cashEntry/format";

// "September"
export const monthName = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "long" });

// "1 Sep – 30 Sep 2026". The year is repeated on both ends when the period spans two.
export function periodLabel(periodStart: string, periodEnd: string): string {
  const startYear = periodStart.slice(0, 4);
  const endYear = periodEnd.slice(0, 4);
  if (startYear === endYear) return `${dayMonth(periodStart)} – ${dayMonth(periodEnd)} ${endYear}`;
  return `${dayMonth(periodStart)} ${startYear} – ${dayMonth(periodEnd)} ${endYear}`;
}

// The gap as a plain amount. Its direction is explained on the finish step.
export const gapPounds = (differencePence: number) => Math.abs(differencePence) / 100;
