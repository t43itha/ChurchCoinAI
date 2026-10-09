// Number and date formatting for the Reports page. Pure, no React.

const GBP_PENCE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const GBP_WHOLE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MINUS = "\u2212";

// Accounts need pence.
export const formatCurrency = (amount: number): string => GBP_PENCE.format(amount || 0);

// Headlines and KPIs read in whole pounds.
export const formatCurrencyWhole = (amount: number): string => GBP_WHOLE.format(Math.round(amount) || 0);

// "+£1,860" / "−£340". Zero carries no sign.
export const formatSignedCurrency = (amount: number): string => {
  const whole = Math.round(Math.abs(amount)) || 0;
  if (whole === 0) return GBP_WHOLE.format(0);
  const sign = amount > 0 ? "+" : MINUS;
  return `${sign}${GBP_WHOLE.format(whole)}`;
};

// Axis ticks: "£12k". Below £1,000 falls back to whole pounds.
export const formatCompactCurrency = (amount: number): string => {
  const abs = Math.abs(amount);
  if (abs < 1000) return GBP_WHOLE.format(Math.round(amount) || 0);
  const thousands = Math.round(amount / 100) / 10;
  return `£${thousands.toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`;
};

// Evenly spaced y-axis ticks from 0 on a 1 / 2 / 2.5 / 5 x 10^n step, about four
// intervals, so the axis reads £5k, £10k, £15k rather than £8k, £15k, £23k.
export const niceAxisTicks = (values: number[]): number[] => {
  const max = Math.max(0, ...values);
  if (max === 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step);
};

// "+4%" / "−12%" / "0%"; "—" when there is no comparison.
export const formatPercentChange = (percent: number | null): string => {
  if (percent === null) return "—";
  const whole = Math.round(percent);
  if (whole === 0) return "0%";
  return `${whole > 0 ? "+" : MINUS}${Math.abs(whole)}%`;
};

// Fixed names: Intl renders September as "Sept" in some engines.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "6 Sep". Parsed at UTC midnight so the day never shifts with the viewer's zone.
export const formatShortDate = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]}`;
};

// Trust signal: readiness below this is flagged amber.
export const READY_THRESHOLD = 95;
