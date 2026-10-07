// Built-in categories that mark a row as money moving rather than income or
// spending. They have no transaction type, so they are valid for both
// directions. lib/reportableTransactions decides what each kind does.
export const MOVEMENT_KINDS = ["transfer", "reversal", "loan"] as const;

export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export type MovementCategorySeed = {
  name: string;
  mainCategory: string;
  movementKind: MovementKind;
  displayOrder: number;
};

const MAIN_CATEGORY = "Transfers and adjustments";

export const MOVEMENT_CATEGORIES: MovementCategorySeed[] = [
  { name: "Transfer between funds", mainCategory: MAIN_CATEGORY, movementKind: "transfer", displayOrder: 1000 },
  { name: "Returned payment", mainCategory: MAIN_CATEGORY, movementKind: "reversal", displayOrder: 1001 },
  { name: "Loan", mainCategory: MAIN_CATEGORY, movementKind: "loan", displayOrder: 1002 },
];

export function isMovementCategory(category: { movementKind?: MovementKind }) {
  return category.movementKind !== undefined;
}

const normalizeName = (name: string) => name.trim().toLowerCase();

// A built-in is found by its kind, so renaming it keeps it. A user category that
// already has the built-in's name is left alone and the built-in is skipped:
// taking it over would reclassify its rows only as each one is next edited.
export function missingMovementCategories(
  existing: Array<{ name: string; movementKind?: MovementKind }>
): MovementCategorySeed[] {
  return MOVEMENT_CATEGORIES.filter(
    (seed) =>
      !existing.some(
        (category) =>
          category.movementKind === seed.movementKind ||
          normalizeName(category.name) === normalizeName(seed.name)
      )
  );
}
