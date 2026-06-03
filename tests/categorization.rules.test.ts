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

  it("categorizes intended utility references as expenditure", () => {
    const utilityDescriptions = [
      "utility bill",
      "utilities direct debit",
      "electric bill",
      "gas supplier",
      "water charges",
      "thames water",
      "british gas",
      "eon energy",
    ];

    for (const description of utilityDescriptions) {
      const suggestion = applyDeterministicRules(
        { description, amount: 100, type: "Expenditure" },
        categories,
        funds
      );

      expect(suggestion?.category, description).toBe("Utilities");
    }
  });

  it("categorizes intended giving references as income", () => {
    const givingDescriptions = [
      ["tithe", "Tithes & First Fruits"],
      ["tithes", "Tithes & First Fruits"],
      ["first fruit", "Tithes & First Fruits"],
      ["firstfruit", "Tithes & First Fruits"],
      ["offering", "Offerings"],
      ["offerings", "Offerings"],
      ["thanksgiving", "Offerings"],
      ["donation", "Offerings"],
    ];

    for (const [description, category] of givingDescriptions) {
      const suggestion = applyDeterministicRules(
        { description, amount: 100, type: "Income" },
        categories,
        funds
      );

      expect(suggestion?.category, description).toBe(category);
    }
  });

  it("does not match utility substrings inside unrelated expenditure descriptions", () => {
    const unrelatedDescriptions = [
      "Vegas retreat",
      "Waterloo hall rental",
      "gaslight repairs",
      "electrician invoice",
      "utilitybelt",
    ];

    for (const description of unrelatedDescriptions) {
      const suggestion = applyDeterministicRules(
        { description, amount: 100, type: "Expenditure" },
        categories,
        funds
      );

      expect(suggestion, description).toBeNull();
    }
  });

  it("does not match giving substrings inside unrelated income descriptions", () => {
    const unrelatedDescriptions = ["offerington", "titheology"];

    for (const description of unrelatedDescriptions) {
      const suggestion = applyDeterministicRules(
        { description, amount: 100, type: "Income" },
        categories,
        funds
      );

      expect(suggestion, description).toBeNull();
    }
  });

  it("marks rule suggestions as requiring review below the confidence threshold", () => {
    const suggestion = applyDeterministicRules(
      { description: "Thames water bill", amount: 80, type: "Expenditure" },
      categories,
      funds
    );

    expect(suggestion?.predictionSource).toBe("rule");
    expect(suggestion?.requiresReview).toBe(true);
  });
});
