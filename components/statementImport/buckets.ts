// Sorting a batch for the categorise step. Pure: no React, no Convex.
import type { TransactionType } from "../../types";
import type { OriginalPrediction, PendingReviewTransaction } from "./types";

export type ReviewBucket = "sure" | "likely" | "needs";

// Valid category names for a transaction type (categoryNamesForTransactionTypes).
export type CategoryNamesFor = (type?: TransactionType, current?: string) => string[];

export const LIKELY_SCORE = 0.8;
// Pipeline sources that match a rule or a remembered correction.
const SURE_SOURCES: ReadonlySet<string> = new Set(["rule", "memory"]);

export const isValidCategory = (row: PendingReviewTransaction, namesFor: CategoryNamesFor): boolean =>
  Boolean(row.category) && namesFor(row.type).includes(row.category as string);

const isConfident = (prediction: OriginalPrediction): boolean =>
  prediction.confidence.toLowerCase() === "high" ||
  (typeof prediction.confidenceScore === "number" && prediction.confidenceScore >= LIKELY_SCORE);

// Sure: a valid category from a rule or memory, or one the user has answered.
// Likely: a valid category from another source that the pipeline is confident in.
// Needs you: everything else, including rows with no valid category.
export function bucketOf(
  row: PendingReviewTransaction,
  prediction: OriginalPrediction | undefined,
  approved: boolean,
  namesFor: CategoryNamesFor
): ReviewBucket {
  if (!isValidCategory(row, namesFor)) return "needs";
  if (approved) return "sure";
  if (prediction && SURE_SOURCES.has(prediction.predictionSource)) return "sure";
  if (prediction && isConfident(prediction)) return "likely";
  return "needs";
}

// Row ids per bucket, in batch order. `approved` holds reviewRowIds the user has answered.
export function groupBuckets(
  rows: PendingReviewTransaction[],
  predictions: ReadonlyMap<string, OriginalPrediction>,
  approved: ReadonlySet<string>,
  namesFor: CategoryNamesFor
): Record<ReviewBucket, string[]> {
  const groups: Record<ReviewBucket, string[]> = { sure: [], likely: [], needs: [] };
  for (const row of rows) {
    const id = row.reviewRowId ?? "";
    groups[bucketOf(row, predictions.get(id), approved.has(id), namesFor)].push(id);
  }
  return groups;
}

// Rows with the same description are answered together. Digits and case are
// ignored, so "SUMUP 0412" and "sumup" group. An empty key groups nothing.
export function describeGroupKey(description: string | undefined): string {
  return (description ?? "").toLowerCase().replace(/\d/g, "").replace(/\s+/g, " ").trim();
}

// The other rows (not rowId) with the same description key, optionally limited to `among`.
export function sameDescriptionRowIds(
  rows: PendingReviewTransaction[],
  rowId: string,
  among?: ReadonlySet<string>
): string[] {
  const target = rows.find((row) => row.reviewRowId === rowId);
  const key = describeGroupKey(target?.description);
  if (!key) return [];
  return rows
    .filter((row) => row.reviewRowId !== rowId && describeGroupKey(row.description) === key)
    .map((row) => row.reviewRowId ?? "")
    .filter((id) => id !== "" && (!among || among.has(id)));
}

// The row shown on the "needs you" card: the focused row while it is still in the
// batch, otherwise the first row that needs an answer.
export function focusedRowId(
  rows: PendingReviewTransaction[],
  needsIds: readonly string[],
  focusId: string | null
): string | null {
  if (focusId && rows.some((row) => row.reviewRowId === focusId)) return focusId;
  return needsIds[0] ?? null;
}

// The next row that still needs an answer after the focused one, wrapping to the
// first. Null when nothing needs an answer.
export function nextNeedsId(
  rows: PendingReviewTransaction[],
  needsIds: readonly string[],
  currentId: string | null
): string | null {
  if (needsIds.length === 0) return null;
  const needs = new Set(needsIds);
  const currentIndex = currentId ? rows.findIndex((row) => row.reviewRowId === currentId) : -1;
  const later = rows
    .slice(currentIndex + 1)
    .map((row) => row.reviewRowId ?? "")
    .find((id) => needs.has(id));
  return later ?? needsIds[0];
}

// Up to three one-tap answers for a row: the pipeline's suggestion first (when it
// is valid for the type), then the categories most used for that type among the
// other rows of the batch that already have a valid category.
export function categoryChoicesFor(
  row: PendingReviewTransaction,
  batch: PendingReviewTransaction[],
  suggestion: string | undefined,
  namesFor: CategoryNamesFor
): string[] {
  const valid = new Set(namesFor(row.type));
  const choices: string[] = [];
  if (suggestion && valid.has(suggestion)) choices.push(suggestion);

  const counts = new Map<string, number>();
  for (const other of batch) {
    if (other.reviewRowId === row.reviewRowId || other.type !== row.type) continue;
    if (!other.category || !valid.has(other.category)) continue;
    counts.set(other.category, (counts.get(other.category) ?? 0) + 1);
  }
  const used = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
  for (const name of used) {
    if (choices.length >= 3) break;
    if (!choices.includes(name)) choices.push(name);
  }
  return choices.slice(0, 3);
}
