import { describe, expect, it } from "vitest";
import {
  safeJsonParse,
  validateGiftAidEligibleTransactions,
} from "../convex/lib/aiValidation";

describe("ai validation helpers", () => {
  it("parses valid json", () => {
    const parsed = safeJsonParse<{ value: number }>('{"value":42}', "payload");
    expect(parsed.value).toBe(42);
  });

  it("throws on invalid json", () => {
    expect(() => safeJsonParse("{bad", "payload")).toThrow(
      "payload must be valid JSON"
    );
  });

  it("validates gift aid eligible transactions", () => {
    const rows = validateGiftAidEligibleTransactions([
      { donorName: "Jane Doe", amount: 50 },
      { amount: 20 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].donorName).toBe("Jane Doe");
    expect(rows[1].donorName).toBe("Unknown Donor");
  });

  it("rejects invalid gift aid payloads", () => {
    expect(() => validateGiftAidEligibleTransactions({})).toThrow(
      "eligibleTransactions must be a JSON array"
    );
    expect(() =>
      validateGiftAidEligibleTransactions([{ donorName: "Jane", amount: 0 }])
    ).toThrow("eligibleTransactions[0].amount must be > 0");
  });
});
