import { describe, expect, it } from "vitest";
import { applyDeterministicRules } from "../convex/intelligence/categorization/rules";
import {
  CategoryLike,
  FundLike,
} from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  {
    name: "Bank Charges",
    transactionType: "Expenditure",
    mainCategory: "Admin & Governance",
  },
  {
    name: "Utilities",
    transactionType: "Expenditure",
    mainCategory: "Premises Costs",
  },
  {
    name: "Tithes & First Fruits",
    transactionType: "Income",
    mainCategory: "Donations",
  },
  {
    name: "Offerings",
    transactionType: "Income",
    mainCategory: "Donations",
  },
];

const funds: FundLike[] = [{ _id: "fund1", name: "General Fund" }];

describe("deterministic categorization rules", () => {
  it("categorizes bank charges as expenditure only", () => {
    const suggestion = applyDeterministicRules(
      { description: "Monthly bank charge", amount: 5, type: "Expenditure" },
      categories,
      funds
    );
    expect(suggestion?.category).toBe("Bank Charges");
  });

  it("does not apply bank charge rule to income", () => {
    const suggestion = applyDeterministicRules(
      { description: "Bank charge refund", amount: 5, type: "Income" },
      categories,
      funds
    );
    expect(suggestion).toBeNull();
  });

  it("categorizes tithe references as income", () => {
    const suggestion = applyDeterministicRules(
      { description: "FT J Smith Tithe", amount: 100, type: "Income" },
      categories,
      funds
    );
    expect(suggestion?.category).toBe("Tithes & First Fruits");
    expect(suggestion?.isGiftAidEligible).toBe(true);
  });
});
