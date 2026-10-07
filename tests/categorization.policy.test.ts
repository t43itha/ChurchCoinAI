import { describe, expect, it } from "vitest";
import { categoryCriterion } from "../convex/intelligence/categorization/policy";

describe("category criteria for the categoriser", () => {
  it("tells the model that supplier refunds are returned payments", () => {
    expect(categoryCriterion("Returned payment")).toContain("supplier refunds");
  });

  it("does not mention refunds under uncategorised income", () => {
    expect(categoryCriterion("Uncategorised")).not.toContain("refund");
  });

  it("keeps loan interest as ordinary expenditure", () => {
    expect(categoryCriterion("Loan")).toContain("Interest is ordinary expenditure.");
  });
});
