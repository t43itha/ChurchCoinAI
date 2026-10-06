import { resolveCategoryForTransaction } from "../convex/intelligence/categorization/categoryResolver";
import { effectiveCategories } from "./transactionCategories";

type Category = { name: string; transactionType?: "Income" | "Expenditure" };
type Fund = { _id: string; name: string };
type Row = { amount?: number; type?: string; category?: string; fundId?: string };

export const isSmallIncome = (row: Row): boolean =>
  row.type === "Income" && typeof row.amount === "number" &&
  Number.isFinite(row.amount) && row.amount >= 0.01 && row.amount <= 30;

// Fill each missing/invalid field independently. Never select a fund by position,
// turn expenditure into income, or infer Gift Aid from this accounting default.
export function applySmallIncomeDefaults<T extends Row>(row: T, categories: Category[], funds: Fund[]): T {
  if (!isSmallIncome(row)) return row;
  const effective = effectiveCategories(categories);
  const category = resolveCategoryForTransaction(row.category ?? "", "Income", effective);
  const offering = resolveCategoryForTransaction("Offerings", "Income", effective);
  const fund = funds.find((candidate) => String(candidate._id) === row.fundId);
  const general = funds.find((candidate) => candidate.name.trim().toLowerCase() === "general fund");
  return {
    ...row,
    ...(!category && offering ? { category: offering.name } : {}),
    ...(!fund && general ? { fundId: String(general._id) } : {}),
  };
}
