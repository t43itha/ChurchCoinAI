import { describe, expect, it } from "vitest";
import {
  isRealIsoDate,
  parseImportedAmount,
  parseImportedDate,
} from "../lib/csvImport";

describe("csv import parsing", () => {
  it("reads UK day-first dates and rejects impossible days", () => {
    expect(parseImportedDate("01/03/2026")).toBe("2026-03-01");
    expect(parseImportedDate("1/2/26")).toBe("2026-02-01");
    expect(parseImportedDate("12 Jan 2026")).toBe("2026-01-12");
    expect(parseImportedDate("01/02/2026 00:00")).toBe("2026-02-01");
    expect(parseImportedDate("31/02/2026")).toBeNull();
    expect(isRealIsoDate("2026-02-31")).toBe(false);
    expect(isRealIsoDate("2024-02-29")).toBe(true);
  });

  it("parses parenthesised debits and rejects partial numbers", () => {
    expect(parseImportedAmount("(250.00)")).toBe(-250);
    expect(parseImportedAmount("-100")).toBe(-100);
    expect(parseImportedAmount("12abc")).toBeNull();
    expect(parseImportedAmount("")).toBeNull();
  });
});
