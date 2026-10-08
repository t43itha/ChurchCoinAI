// Pure logic behind the import review batch. Shared by the CSV import, the bank
// sync and the guided statement walkthrough. No React and no Convex calls here:
// side effects arrive as injected callbacks so the flows can be tested directly.
import type { Id } from "../../convex/_generated/dataModel";
import { resolveAssignableCategory } from "../../convex/intelligence/categorization/categoryResolver";
import { isRealIsoDate } from "../../lib/csvImport";
import { screenImportRows, withImportKeys, type StatementRow } from "../../lib/importKeys";
import { acceptedPairsToLink, pairBasis, type PairSuggestion } from "../../lib/movementMatching";
import { applySmallIncomeDefaults } from "../../lib/smallIncomeDefaults";
import { describeLeftOutRows, MAX_IMPORT_ROWS, type MappingResult } from "../../lib/statementImport";
import { effectiveCategories } from "../../lib/transactionCategories";
import type { Fund } from "../../types";
import type {
  BulkCreateResult,
  ConfirmImportResult,
  CorrectionInput,
  CreateTransactionInput,
  LedgerTransaction,
  OriginalPrediction,
  PendingReviewTransaction,
  PipelinePredictionSource,
  PipelineSuggestInput,
  PipelineSuggestion,
  ReviewCategory,
  SyncedBankTransaction,
} from "./types";

// Mirrors React's Dispatch<SetStateAction<T>> so the real setters can be passed in.
export type Setter<T> = (update: T | ((current: T) => T)) => void;

type LedgerRows = Parameters<typeof screenImportRows>[1];

export const reindexSetAfterRemoval = (values: Set<number>, removedIndex: number): Set<number> => {
  const reindexed = new Set<number>();
  values.forEach((value) => {
    if (value < removedIndex) {
      reindexed.add(value);
    } else if (value > removedIndex) {
      reindexed.add(value - 1);
    }
  });
  return reindexed;
};

export type ScreenedStatement =
  | { tooMany: true; count: number }
  | {
      tooMany: false;
      fresh: PendingReviewTransaction[];
      alreadyImported: PendingReviewTransaction[];
      possibleDuplicates: Set<number>;
      leftOutNotice: string | null;
    };

// What happens to a mapped statement once the columns are read: defaults are
// applied, rows are keyed, and rows already in the ledger are split off.
// `prior` is the rows already in the batch: new rows continue their occurrence
// numbers, so an identical row added later gets its own import key.
export function screenStatementRows(
  mapped: Pick<MappingResult, "rows" | "skipped" | "errors">,
  ledger: LedgerRows,
  categories: ReviewCategory[],
  funds: Fund[],
  prior: StatementRow[] = []
): ScreenedStatement {
  const parsed: Array<PendingReviewTransaction & StatementRow> = mapped.rows.map((row) => applySmallIncomeDefaults({
    reviewRowId: crypto.randomUUID(),
    date: row.date,
    description: row.description,
    amount: row.amount,
    type: row.type,
    category: "",
  }, categories, funds));
  const keyed = withImportKeys([...prior, ...parsed]).slice(prior.length);
  const { fresh, alreadyImported, possibleDuplicates } = screenImportRows(keyed, ledger);
  if (fresh.length > MAX_IMPORT_ROWS) return { tooMany: true, count: fresh.length };
  return {
    tooMany: false,
    fresh,
    alreadyImported,
    possibleDuplicates,
    leftOutNotice: describeLeftOutRows(mapped),
  };
}

export function screenSyncedBankRows(
  synced: SyncedBankTransaction[],
  bankConnectionId: Id<"bankConnections">,
  ledger: LedgerRows,
  categories: ReviewCategory[],
  funds: Fund[]
) {
  const pending: Array<PendingReviewTransaction & StatementRow> = synced.map((tx) => applySmallIncomeDefaults({
    reviewRowId: crypto.randomUUID(),
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    fundId: tx.fundId || undefined,
    category: "",
    isGiftAidEligible: false,
    source: "bank" as const,
    providerTransactionId: tx.providerTransactionId,
    bankConnectionId,
  }, categories, funds));
  return screenImportRows(pending, ledger);
}

export function getPipelineConfidenceLabel(suggestion: {
  confidenceLabel?: string;
  confidence?: string | number;
}): string {
  const confidence = suggestion.confidenceLabel ?? suggestion.confidence;
  if (typeof confidence === "number") return String(confidence);
  return confidence || "Low";
}

export function getPipelineSourceLabel(predictionSource: PipelinePredictionSource, ragScore?: number): string {
  switch (predictionSource) {
    case "memory":
      return "Memory Match";
    case "rule":
      return "Rule Match";
    case "rag":
      return typeof ragScore === "number"
        ? `RAG Match (${Math.round(ragScore * 100)}%)`
        : "RAG Match";
    case "gemini":
      return "Gemini AI";
    case "openai":
      return "Luna AI (OpenAI)";
    case "openrouter":
      return "Luna AI";
    case "none":
    default:
      return "No AI suggestion";
  }
}

export function predictionFromSuggestion(suggestion: PipelineSuggestion): OriginalPrediction {
  return {
    category: suggestion.category,
    fundId: suggestion.fundId,
    isGiftAidEligible: suggestion.isGiftAidEligible,
    donorName: suggestion.donorName,
    confidence: getPipelineConfidenceLabel(suggestion),
    confidenceScore: suggestion.confidence,
    predictionSource: suggestion.predictionSource,
    ragScore: suggestion.ragScore,
  };
}

export function applySuggestionToRow(
  row: PendingReviewTransaction,
  suggestion: PipelineSuggestion,
  categories: ReviewCategory[],
  funds: Fund[]
): PendingReviewTransaction {
  return applySmallIncomeDefaults({
    ...row,
    category: suggestion.category || row.category,
    fundId: suggestion.fundId || row.fundId,
    donorName: row.donorName ?? suggestion.donorName ?? undefined,
    // Model inference cannot establish a donor's declaration status.
    isGiftAidEligible: row.isGiftAidEligible ?? false,
    requiresReview: suggestion.requiresReview,
    notes: `${getPipelineSourceLabel(suggestion.predictionSource, suggestion.ragScore)} | Confidence: ${getPipelineConfidenceLabel(suggestion)}`,
  }, categories, funds);
}

// Runs the categorisation pipeline in batches of 20 with two requests in flight.
// A run is abandoned as soon as runCounter moves on (new run, or the review was
// cleared), so late responses never touch the current batch.
export async function runCategorisation(input: {
  rows: PendingReviewTransaction[];
  runCounter: { current: number };
  funds: Fund[];
  categories: ReviewCategory[];
  suggest: (transactions: PipelineSuggestInput[]) => Promise<PipelineSuggestion[]>;
  setRows: Setter<PendingReviewTransaction[]>;
  setCount: (count: number) => void;
  setStatus: (message: string) => void;
  setIsCategorising: (busy: boolean) => void;
}): Promise<void> {
  const run = ++input.runCounter.current;
  const isCurrent = () => input.runCounter.current === run;
  // A new run starts from rows with no earlier predictions.
  const snapshot = input.rows.map((row) => ({
    ...row,
    reviewRowId: row.reviewRowId ?? crypto.randomUUID(),
    originalPrediction: undefined,
  }));
  input.setRows(snapshot);
  input.setCount(snapshot.length);
  input.setStatus("");
  input.setIsCategorising(true);
  let next = 0;
  let completed = 0;
  let failed = 0;
  const worker = async () => {
    while (next < snapshot.length && isCurrent()) {
      const batch = snapshot.slice(next, next += 20);
      try {
        const suggestions = await input.suggest(batch.map((row) => ({
          rowId: row.reviewRowId,
          description: row.description ?? "",
          amount: row.amount ?? 0,
          type: row.type ?? "Income",
          category: row.category,
          fundId: input.funds.some((fund) => fund._id === row.fundId) ? row.fundId as Id<"funds"> : undefined,
          donorName: row.donorName,
        })));
        if (!isCurrent()) return;
        const byId = new Map(suggestions.map((suggestion) => [suggestion.rowId, suggestion]));
        const originals = new Map(batch.map((row) => [row.reviewRowId, row]));
        input.setRows((current) => current.map((row) => {
          const original = originals.get(row.reviewRowId ?? "");
          const suggestion = byId.get(row.reviewRowId ?? "");
          // A user edit or removal while inference was running wins, so nothing is applied
          // or recorded for that row.
          if (!suggestion || row !== original) return row;
          return {
            ...applySuggestionToRow(row, suggestion, input.categories, input.funds),
            originalPrediction: predictionFromSuggestion(suggestion),
          };
        }));
      } catch {
        failed += batch.length;
      }
      completed += batch.length;
      if (isCurrent()) input.setStatus(`${completed} of ${snapshot.length} entries processed. Suggestions are ready to review as they arrive.`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(2, Math.ceil(snapshot.length / 20)) }, worker));
  } finally {
    if (isCurrent()) {
      input.setIsCategorising(false);
      input.setStatus(failed
        ? `${snapshot.length - failed} entries processed; ${failed} need manual review or a retry.`
        : `Auto-categorisation complete. ${snapshot.length} entries ready to review.`);
    }
  }
}

// Returns the text for the "Every row needs..." error, or null when every row is importable.
export function importProblemNotice(rows: PendingReviewTransaction[], categories: ReviewCategory[], funds: Fund[]): string | null {
  const problems = rows.flatMap((transaction) => {
    const reason = !resolveAssignableCategory(transaction.category ?? "", transaction.type || "Income", effectiveCategories(categories)) ? "Choose a category for"
      : !funds.some((fund) => fund._id === transaction.fundId) ? "Choose a fund for"
      : !isRealIsoDate(transaction.date || "") ? "Check the date for"
      : null;
    return reason ? [{ reason, label: `"${transaction.description || "Untitled"}" (${transaction.date || "no date"})` }] : [];
  });
  if (problems.length === 0) return null;
  const detail = [...new Set(problems.map((problem) => problem.reason))].map((reason) => {
    const labels = problems.filter((problem) => problem.reason === reason).map((problem) => problem.label);
    return `${reason}: ${labels.slice(0, 5).join(", ")}${labels.length > 5 ? ` and ${labels.length - 5} more` : ""}`;
  });
  return `Every row needs a real date, a valid category and a valid fund before import. ${detail.join(". ")}.`;
}

export function toCreatePayload(rows: PendingReviewTransaction[]): CreateTransactionInput[] {
  return rows.map((pt) => ({
    date: pt.date!,
    description: pt.description || "",
    amount: pt.amount || 0,
    type: (pt.type || "Income") as "Income" | "Expenditure",
    category: pt.category,
    fundId: pt.fundId as Id<"funds">,
    isGiftAidEligible: pt.isGiftAidEligible || false,
    donorName: pt.donorName, // Keep extracted name for reference
    // No auto-linking: donorId and pledgeId left undefined
    // User can manually link transactions to donors/pledges later
    notes: pt.notes?.replace(/ \| New Donor:.*$/, "").replace(/ \| Donor:.*$/, "").replace(/ \| Pledge:.*$/, "") || undefined,
    // Bank rows carry provider ids and statement rows carry import keys
    // so the server can skip anything already imported
    bankConnectionId: pt.bankConnectionId as Id<"bankConnections"> | undefined,
    providerTransactionId: pt.providerTransactionId,
    importKey: pt.importKey,
  }));
}

export function buildCorrections(
  importRows: PendingReviewTransaction[],
  predictions: Map<string, OriginalPrediction>,
  ids: Array<Id<"transactions"> | null>
): CorrectionInput[] {
  return importRows
    .map((pt, idx) => {
      const prediction = predictions.get(pt.reviewRowId ?? "");
      if (!prediction || !ids[idx]) return null;

      return {
        transactionId: ids[idx] as Id<"transactions">,
        description: pt.description || "",
        aiPredictedCategory: prediction.category,
        aiConfidence: prediction.confidence,
        predictionSource: prediction.predictionSource,
        ragScore: prediction.ragScore,
        finalCategory: pt.category || "",
        aiPredictedFundId: prediction.fundId as Id<"funds"> | undefined,
        aiPredictedGiftAidEligible: prediction.isGiftAidEligible,
        aiPredictedDonorName: prediction.donorName || undefined,
        aiConfidenceScore: prediction.confidenceScore,
        finalFundId: pt.fundId as Id<"funds">,
        finalGiftAidEligible: pt.isGiftAidEligible || false,
        finalDonorName: pt.donorName || undefined,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

// Latest transaction date among the bank rows fetched for this connection.
export function bankSyncCheckpoint(rows: PendingReviewTransaction[], bankConnectionId: Id<"bankConnections">): string | null {
  const dates = rows
    .filter((pt) => pt.source === "bank" && pt.bankConnectionId === bankConnectionId && pt.date)
    .map((pt) => pt.date as string);
  if (dates.length === 0) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

export function pairPartnerLabel(
  pair: PairSuggestion,
  pendingById: Map<string, PendingReviewTransaction>,
  ledgerById: Map<string, { description?: string; date?: string }>
): string {
  const partner = pair.source === "import" ? pendingById.get(pair.id) : ledgerById.get(pair.id);
  if (!partner) return "another transaction";
  const [year, month, day] = (partner.date ?? "").split("-");
  return `${partner.description || "No description"}, ${day}/${month}/${year}`;
}

export function acceptPairOnRows(rows: PendingReviewTransaction[], rowId: string, pair: PairSuggestion): PendingReviewTransaction[] {
  return rows.map((row) => {
    if (row.reviewRowId === rowId) return { ...row, pairWith: pair, pairBasis: pairBasis(row) };
    if (pair.source === "import" && row.reviewRowId === pair.id) {
      return { ...row, pairWith: { source: "import", id: rowId }, pairBasis: pairBasis(row) };
    }
    return row;
  });
}

export function undoPairOnRows(rows: PendingReviewTransaction[], rowId: string, pair: PairSuggestion): PendingReviewTransaction[] {
  return rows.map((row) => {
    const isThisRow = row.reviewRowId === rowId;
    const isPartner = pair.source === "import" && row.reviewRowId === pair.id && row.pairWith?.id === rowId;
    return isThisRow || isPartner ? { ...row, pairWith: undefined, pairBasis: undefined } : row;
  });
}

export type ConfirmImportInput = {
  pendingRows: PendingReviewTransaction[];
  alreadyImportedRows: PendingReviewTransaction[];
  isCategorising: boolean;
  bankSyncReviewConnectionId: Id<"bankConnections"> | null;
  // True while a further bank batch exists that has not been fetched yet.
  hasMoreBankRows: boolean;
  funds: Fund[];
  categories: ReviewCategory[];
  ledger: LedgerTransaction[];
  predictions: Map<string, OriginalPrediction>;
  onPledgeCompleted?: (donorName: string, amount: number) => void;
};

export type ConfirmImportDeps = {
  notify: (title: string, message: string) => void;
  setRows: Setter<PendingReviewTransaction[]>;
  bulkCreate: (args: { transactions: CreateTransactionInput[] }) => Promise<BulkCreateResult>;
  acknowledgeBankSync: (args: { bankConnectionId: Id<"bankConnections">; lastSyncedThrough: string }) => Promise<unknown>;
  recordCorrections: (args: { corrections: CorrectionInput[] }) => Promise<unknown>;
  linkTransactions: (args: { transactionIds: [Id<"transactions">, Id<"transactions">] }) => Promise<unknown>;
};

export async function runConfirmImport(input: ConfirmImportInput, deps: ConfirmImportDeps): Promise<ConfirmImportResult> {
  const { notify } = deps;
  if (input.isCategorising) {
    notify("Categorisation in progress", "Wait for auto-categorisation to finish before confirming this import.");
    return { ok: false };
  }
  if (input.bankSyncReviewConnectionId && input.hasMoreBankRows) {
    notify("More Available", "Fetch the next bank transaction batch before importing, or discard this review batch to sync again later.");
    return { ok: false };
  }
  if (!input.funds[0]) {
    notify("Error", "Add a fund before importing transactions.");
    return { ok: false };
  }
  const importRows = input.pendingRows.map((transaction) => applySmallIncomeDefaults(transaction, input.categories, input.funds));
  deps.setRows(importRows);
  const problem = importProblemNotice(importRows, input.categories, input.funds);
  if (problem) {
    notify("Error", problem);
    return { ok: false };
  }

  try {
    const result = await deps.bulkCreate({ transactions: toCreatePayload(importRows) });

    // Rows left out as already imported were still fetched by this sync.
    const lastSyncedThrough = input.bankSyncReviewConnectionId
      ? bankSyncCheckpoint([...input.pendingRows, ...input.alreadyImportedRows], input.bankSyncReviewConnectionId)
      : null;
    if (input.bankSyncReviewConnectionId && lastSyncedThrough) {
      try {
        await deps.acknowledgeBankSync({
          bankConnectionId: input.bankSyncReviewConnectionId,
          lastSyncedThrough,
        });
      } catch (syncStateError) {
        console.warn("Failed to update bank sync checkpoint:", syncStateError);
        notify("Warning", "Transactions were imported, but the bank sync checkpoint was not updated. The next sync may show duplicate warnings.");
      }
    }

    // Record corrections for ML learning if we have original predictions
    if (input.predictions.size > 0) {
      const correctionsToRecord = buildCorrections(importRows, input.predictions, result.ids);
      if (correctionsToRecord.length > 0) {
        try {
          await deps.recordCorrections({ corrections: correctionsToRecord });
        } catch (correctionError) {
          console.warn("Failed to record corrections:", correctionError);
          // Don't block import if correction recording fails
        }
      }
    }

    // Accepted pairs are re-checked against current state, then linked.
    const createdIds = new Map<string, string>();
    importRows.forEach((row, index) => {
      const id = result.ids[index];
      if (row.reviewRowId && id) createdIds.set(row.reviewRowId, id);
    });
    const { links, unmatched } = acceptedPairsToLink({
      rows: importRows,
      createdIds,
      categories: effectiveCategories(input.categories),
      ledger: input.ledger,
    });
    let linkedCount = 0;
    let unlinkedCount = unmatched;
    for (const [firstId, secondId] of links) {
      try {
        await deps.linkTransactions({ transactionIds: [firstId as Id<"transactions">, secondId as Id<"transactions">] });
        linkedCount += 1;
      } catch (linkError) {
        console.warn("Failed to link import pair:", linkError);
        unlinkedCount += 1;
      }
    }
    if (linkedCount > 0) {
      notify("Pairs Linked", `${linkedCount} pair${linkedCount === 1 ? " was" : "s were"} linked.`);
    }
    if (unlinkedCount > 0) {
      notify("Warning", `Imported, but ${unlinkedCount} pair${unlinkedCount === 1 ? " couldn't" : "s couldn't"} be linked. Link them from Transactions.`);
    }

    // Notify about completed pledges (if any were manually linked)
    if (result.completedPledges && input.onPledgeCompleted) {
      for (const completed of result.completedPledges) {
        input.onPledgeCompleted(completed.donorName, completed.amount);
      }
    }

    if (result.skippedDuplicates) {
      notify(
        "Duplicates Skipped",
        `${result.skippedDuplicates} transaction${result.skippedDuplicates === 1 ? " was" : "s were"} already imported and ${result.skippedDuplicates === 1 ? "was" : "were"} skipped.`
      );
    }

    return { ok: true, created: result.count, skippedDuplicates: result.skippedDuplicates };
  } catch (error) {
    console.error("Import failed:", error);
    notify("Error", error instanceof Error ? error.message : "Failed to import transactions.");
    return { ok: false };
  }
}
