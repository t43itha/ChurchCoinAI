import { describe, expect, it } from "vitest";
import {
  allowedCategoriesForType,
  resolveCategoryForTransaction,
  resolveReportingMainCategory,
} from "../convex/intelligence/categorization/categoryResolver";
import { CategoryLike } from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  { name: "Tithes & First Fruits", mainCategory: "Donations", transactionType: "Income" },
  { name: "Offerings", mainCategory: "Donations", transactionType: "Income" },
  { name: "Bank Charges", mainCategory: "Admin & Governance", transactionType: "Expenditure" },
  { name: "Utilities", mainCategory: "Premises Costs", transactionType: "Expenditure" },
  { name: "Legacy", mainCategory: "Other" },
];

describe("category resolver", () => {
  it("filters categories by transaction type and excludes unknown type", () => {
    expect(allowedCategoriesForType(categories, "Income").map((c) => c.name)).toEqual([
      "Tithes & First Fruits",
      "Offerings",
    ]);
    expect(allowedCategoriesForType(categories, "Expenditure").map((c) => c.name)).toEqual([
      "Bank Charges",
      "Utilities",
    ]);
  });

  it("resolves aliases only when the canonical category type matches", () => {
    expect(resolveCategoryForTransaction("Tithe", "Income", categories)?.name).toBe(
      "Tithes & First Fruits"
    );
    expect(resolveCategoryForTransaction("Tithe", "Expenditure", categories)).toBeNull();
  });

  it("rejects mismatched and unknown type categories", () => {
    expect(resolveCategoryForTransaction("Bank Charges", "Income", categories)).toBeNull();
    expect(resolveCategoryForTransaction("Legacy", "Income", categories)).toBeNull();
  });

  it("returns reporting fallback by transaction type", () => {
    expect(resolveReportingMainCategory("Missing", "Income", categories)).toBe("Other Income");
    expect(resolveReportingMainCategory("Missing", "Expenditure", categories)).toBe(
      "Admin & Governance"
    );
  });
});
