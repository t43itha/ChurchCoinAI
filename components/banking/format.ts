import { gbp } from "../cashEntry/format";
import { signedGbp } from "../statementImport/format";

// "−£10.00" when the bank shows less, "+£10.00" when it shows more, "£0.00" when they agree, "—" while unknown.
export const differenceText = (variance: number | null) => {
  if (variance === null) return "—";
  return variance === 0 ? gbp(0) : signedGbp(variance);
};

// "1 collection", "3 collections".
export const countLabel = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
