import { getRCICategorySeedData } from "../constants/rciCategories";
import { resolveCategoryForTransaction } from "../convex/intelligence/categorization/categoryResolver";
import type { TransactionType } from "../types";

interface CategoryOption {
  name: string;
  transactionType?: TransactionType;
}

const normalizeName = (name: string) => name.trim().toLowerCase();
const seededCategories = getRCICategorySeedData();

export function categoryNamesForTransactionTypes(
  categories: CategoryOption[],
  transactionTypes: Iterable<TransactionType | undefined>
): string[] {
  const types = [...new Set(transactionTypes)];
  if (types.length === 0 || types.includes(undefined)) return [];

  // Writes backfill missing seed categories and type legacy seeded rows before
  // validating. Offer only names that will still be valid after that backfill.
  const categoriesAfterBackfill = categories.map((category) => ({ ...category }));
  for (const seed of seededCategories) {
    const existing = categoriesAfterBackfill.find(
      (category) => normalizeName(category.name) === normalizeName(seed.name)
    );
    if (existing) {
      existing.transactionType ??= seed.transactionType;
    } else {
      categoriesAfterBackfill.push(seed);
    }
  }

  return categories
    .filter((category) =>
      types.every((type) =>
        type && resolveCategoryForTransaction(category.name, type, categoriesAfterBackfill)
      )
    )
    .map((category) => category.name);
}
