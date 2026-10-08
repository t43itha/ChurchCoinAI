import { gbp } from "../cashEntry/format";

// "+£250.00" / "−£212.18" for a signed amount in pounds.
export const signedGbp = (value: number) => `${value < 0 ? "−" : "+"}${gbp(Math.abs(value))}`;

// "Sun 1 March 2026"
export const fullDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
