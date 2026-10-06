const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UK_NUMERIC = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/;
const UK_MONTH = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2}|\d{4})$/;

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const pad = (value: number) => String(value).padStart(2, "0");

const expandYear = (year: string) => {
  if (year.length === 4) return Number(year);
  const short = Number(year);
  return short >= 70 ? 1900 + short : 2000 + short;
};

export const isRealIsoDate = (value: string) => {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const toIso = (year: number, month: number, day: number) => {
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return isRealIsoDate(iso) ? iso : null;
};

// UK bank exports use day-first dates. Impossible days such as 31 February
// return null so the row can be flagged instead of stored.
export const parseImportedDate = (value: string): string | null => {
  const trimmed = value.trim().replace(/,.*/, "").replace(/\s+\d{1,2}:\d{2}.*$/, "");
  if (!trimmed) return null;
  if (ISO_DATE.test(trimmed)) return isRealIsoDate(trimmed) ? trimmed : null;

  const numeric = UK_NUMERIC.exec(trimmed);
  if (numeric) {
    return toIso(expandYear(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }

  const named = UK_MONTH.exec(trimmed);
  if (named) {
    const month = MONTHS.findIndex((name) =>
      named[2].toLowerCase().startsWith(name)
    );
    if (month < 0) return null;
    return toIso(expandYear(named[3]), month + 1, Number(named[1]));
  }

  return null;
};

// Returns a signed amount. Accounting parentheses are debits. Unparseable
// text returns null so the row is reported instead of dropped as zero.
export const parseImportedAmount = (value: string): number | null => {
  if (!value || !value.trim()) return null;
  let text = value.trim().replace(/[£$,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/dr$/i.test(text)) {
    negative = true;
    text = text.replace(/dr$/i, "");
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return negative ? -amount : amount;
};
