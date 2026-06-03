import { CATEGORY_ALIASES } from "../../../constants/rciCategories";
import { CategoryLike, TransactionType } from "./types";

const normalizeCategoryName = (value: string): string =>
  value.trim().toLowerCase();

const NORMALIZED_CATEGORY_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_ALIASES).map(([alias, canonicalName]) => [
    normalizeCategoryName(alias),
    canonicalName,
  ])
);

export const allowedCategoriesForType = (
  categories: CategoryLike[],
  transactionType: TransactionType
): CategoryLike[] =>
  categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => category.transactionType === transactionType)
    .sort((a, b) => {
      const orderA = a.category.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.category.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      if (a.category.displayOrder !== undefined && b.category.displayOrder !== undefined) {
        return a.category.name.localeCompare(b.category.name);
      }
      return a.index - b.index;
    })
    .map(({ category }) => category);

export const resolveCategoryForTransaction = (
  categoryName: string,
  transactionType: TransactionType,
  categories: CategoryLike[]
): CategoryLike | null => {
  const rawName = categoryName.trim();
  if (!rawName) return null;

  const normalizedRawName = normalizeCategoryName(rawName);
  const canonicalName = NORMALIZED_CATEGORY_ALIASES[normalizedRawName] ?? rawName;
  const normalized = normalizeCategoryName(canonicalName);

  const match = categories.find(
    (category) =>
      normalizeCategoryName(category.name) === normalized &&
      category.transactionType === transactionType
  );

  return match ?? null;
};

export const resolveReportingMainCategory = (
  categoryName: string,
  transactionType: TransactionType,
  categories: CategoryLike[]
): string => {
  const resolved = resolveCategoryForTransaction(
    categoryName,
    transactionType,
    categories
  );

  if (resolved?.mainCategory) return resolved.mainCategory;
  return transactionType === "Income" ? "Other Income" : "Admin & Governance";
};

export const categoryNamesForPrompt = (
  categories: CategoryLike[],
  transactionType: TransactionType
): string[] =>
  allowedCategoriesForType(categories, transactionType).map(
    (category) => category.name
  );
