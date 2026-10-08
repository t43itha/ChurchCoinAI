import { useMemo, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { exceedsImportLimit, MAX_IMPORT_ROWS, type MappingResult } from "../../lib/statementImport";
import { effectiveCategories } from "../../lib/transactionCategories";
import { notify } from "../../lib/notifications";
import {
  importMovementLegs,
  ledgerMovementLegs,
  livePairs,
  suggestImportPairs,
  type PairSuggestion,
} from "../../lib/movementMatching";
import type { Fund } from "../../types";
import {
  acceptPairOnRows,
  pairPartnerLabel,
  reindexSetAfterRemoval,
  runCategorisation,
  runConfirmImport,
  screenStatementRows,
  screenSyncedBankRows,
  undoPairOnRows,
} from "./reviewLogic";
import type {
  BankSyncCursor,
  ConfirmImportResult,
  LedgerTransaction,
  OriginalPrediction,
  PendingReviewTransaction,
  ReviewCategory,
  SyncedBankTransaction,
} from "./types";

export type ImportReviewDeps = {
  funds: Fund[];
  categories: ReviewCategory[];
  // The full ledger; screening and pair suggestions read it. Undefined while loading.
  ledger: LedgerTransaction[] | undefined;
  onPledgeCompleted?: (donorName: string, amount: number) => void;
};

export interface ImportReview {
  // Review batch visibility and contents
  isReviewOpen: boolean;
  openReview: () => void;
  rows: PendingReviewTransaction[];
  duplicateWarnings: Set<number>;
  alreadyImportedRows: PendingReviewTransaction[];
  // Categorisation of the current batch
  predictions: Map<string, OriginalPrediction>;
  isCategorising: boolean;
  categorisingCount: number;
  statusMessage: string;
  // Bank sync
  isSyncingBank: boolean;
  isFetchingMoreBank: boolean;
  hasMoreBankRows: boolean;
  // Starting batches
  startStatementReview: (mapped: MappingResult) => boolean;
  syncFromBank: (connectionId: Id<"bankConnections">, cursor?: BankSyncCursor, options?: { append?: boolean }) => Promise<void>;
  fetchNextBankBatch: () => Promise<void>;
  // Editing rows
  updateRow: (index: number, updates: Partial<PendingReviewTransaction>) => void;
  removeRow: (index: number) => void;
  assignFundToAll: (fundId: string) => void;
  includeAlreadyImported: () => void;
  pairing: {
    suggestionFor: (rowId: string) => PairSuggestion | undefined;
    activeFor: (rowId: string) => PairSuggestion | undefined;
    isDismissed: (rowId: string) => boolean;
    partnerLabel: (pair: PairSuggestion) => string;
    accept: (rowId: string, pair: PairSuggestion) => void;
    undo: (rowId: string, pair: PairSuggestion) => void;
    dismiss: (rowId: string) => void;
  };
  // Finishing
  categorise: () => Promise<void>;
  confirm: () => Promise<ConfirmImportResult>;
  clear: () => void;
}

export function useImportReview({ funds, categories, ledger, onPledgeCompleted }: ImportReviewDeps): ImportReview {
  const bulkCreateTransactions = useMutation(api.mutations.transactions.bulkCreate);
  const recordCorrections = useMutation(api.mutations.transactions.recordCorrections);
  const linkTransactions = useMutation(api.mutations.movements.link);
  const categorizeWithPipeline = useAction(api.actions.ai.categorizeWithPipelinePreview);
  const syncTransactions = useAction(api.actions.bankConnections.syncTransactions);
  const acknowledgeBankSync = useMutation(api.mutations.bankConnections.acknowledgeSyncThrough);

  const importCategories = useMemo(() => effectiveCategories(categories), [categories]);
  // Screening reads the ledger as an array; `ledger` itself is kept for memo deps
  // so the suggestion maps are not rebuilt on every render while the query loads.
  const ledgerRows = ledger ?? [];

  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [rows, setRows] = useState<PendingReviewTransaction[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<Set<number>>(new Set());
  const [alreadyImportedRows, setAlreadyImportedRows] = useState<PendingReviewTransaction[]>([]);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(() => new Set());
  const [predictions, setPredictions] = useState<Map<string, OriginalPrediction>>(new Map());
  const [isCategorising, setIsCategorising] = useState(false);
  const [categorisingCount, setCategorisingCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  // Bumped to abandon an in-flight categorisation run.
  const categorisationRun = useRef(0);

  const [isSyncingBank, setIsSyncingBank] = useState(false);
  const [isFetchingMoreBank, setIsFetchingMoreBank] = useState(false);
  const [nextBankSyncCursor, setNextBankSyncCursor] = useState<BankSyncCursor | null>(null);
  const [nextBankSyncConnectionId, setNextBankSyncConnectionId] = useState<Id<"bankConnections"> | null>(null);
  const [bankSyncReviewConnectionId, setBankSyncReviewConnectionId] = useState<Id<"bankConnections"> | null>(null);
  const hasMoreBankRows = nextBankSyncCursor !== null && nextBankSyncConnectionId !== null;

  const pairSuggestions = useMemo(
    () => suggestImportPairs(importMovementLegs(rows, importCategories), ledgerMovementLegs(ledger ?? [])),
    [rows, importCategories, ledger]
  );
  const activePairs = useMemo(() => livePairs(rows), [rows]);
  const pendingById = useMemo(
    () => new Map(rows.flatMap((row) => (row.reviewRowId ? [[row.reviewRowId, row] as const] : []))),
    [rows]
  );
  const transactionsById = useMemo(
    () => new Map((ledger ?? []).map((transaction) => [String(transaction._id), transaction] as const)),
    [ledger]
  );

  const openReview = () => setIsReviewOpen(true);

  const clear = () => {
    categorisationRun.current += 1;
    setIsReviewOpen(false);
    setIsCategorising(false);
    setStatusMessage("");
    setCategorisingCount(0);
    setRows([]);
    setDuplicateWarnings(new Set());
    setAlreadyImportedRows([]);
    setNextBankSyncCursor(null);
    setNextBankSyncConnectionId(null);
    setBankSyncReviewConnectionId(null);
    setPredictions(new Map());
    setDismissedPairs(new Set());
  };

  const startStatementReview = (mapped: MappingResult): boolean => {
    const screen = screenStatementRows(mapped, ledgerRows, categories, funds);
    if (screen.tooMany) {
      notify("Too many transactions", `This file has ${screen.count} transactions. Import up to ${MAX_IMPORT_ROWS} at a time — split the file by date range.`);
      return false;
    }
    if (screen.leftOutNotice) notify("Rows left out", screen.leftOutNotice);

    setDuplicateWarnings(screen.possibleDuplicates);
    setAlreadyImportedRows(screen.alreadyImported);
    setNextBankSyncCursor(null);
    setNextBankSyncConnectionId(null);
    setBankSyncReviewConnectionId(null);
    setRows(screen.fresh);
    setIsReviewOpen(true);
    return true;
  };

  // Statement rows can match a ledger row from another account's statement, so
  // the user may override; bank rows matched by provider id are never re-imported.
  const includeAlreadyImported = () => {
    const rowsToAdd = alreadyImportedRows.filter((row) => row.importKey).map((row) => ({ ...row, importKey: undefined }));
    const total = rows.length + rowsToAdd.length;
    if (exceedsImportLimit(total)) {
      notify("Too many transactions", `Adding these would make ${total} transactions. Import up to ${MAX_IMPORT_ROWS} at a time — split the file by date range.`);
      return;
    }
    const startIndex = rows.length;
    setRows((current) => [...current, ...rowsToAdd]);
    setDuplicateWarnings((current) => new Set([...current, ...rowsToAdd.map((_, index) => startIndex + index)]));
    setAlreadyImportedRows((current) => current.filter((row) => !row.importKey));
  };

  const updateRow = (index: number, updates: Partial<PendingReviewTransaction>) => {
    setRows((current) => current.map((transaction, currentIndex) => (
      currentIndex === index ? { ...transaction, ...updates } : transaction
    )));
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, idx) => idx !== index));
    setDuplicateWarnings((current) => reindexSetAfterRemoval(current, index));
  };

  const assignFundToAll = (fundId: string) => {
    setRows((current) => current.map((transaction) => ({ ...transaction, fundId })));
  };

  const pairing: ImportReview["pairing"] = {
    suggestionFor: (rowId) => pairSuggestions.get(rowId),
    activeFor: (rowId) => activePairs.get(rowId),
    isDismissed: (rowId) => dismissedPairs.has(rowId),
    partnerLabel: (pair) => pairPartnerLabel(pair, pendingById, transactionsById),
    accept: (rowId, pair) => setRows((current) => acceptPairOnRows(current, rowId, pair)),
    undo: (rowId, pair) => setRows((current) => undoPairOnRows(current, rowId, pair)),
    dismiss: (rowId) => setDismissedPairs((current) => new Set(current).add(rowId)),
  };

  const applyBankBatch = (synced: SyncedBankTransaction[], append: boolean, bankConnectionId: Id<"bankConnections">) => {
    const { fresh, alreadyImported, possibleDuplicates } = screenSyncedBankRows(synced, bankConnectionId, ledgerRows, categories, funds);
    setAlreadyImportedRows((current) => (append ? [...current, ...alreadyImported] : alreadyImported));
    setRows((current) => {
      const startIndex = append ? current.length : 0;
      setDuplicateWarnings((currentWarnings) => {
        const duplicates = new Set<number>(append ? currentWarnings : []);
        possibleDuplicates.forEach((index) => duplicates.add(startIndex + index));
        return duplicates;
      });

      return append ? [...current, ...fresh] : fresh;
    });
  };

  const syncFromBank = async (
    bankConnectionId: Id<"bankConnections">,
    cursor?: BankSyncCursor,
    options: { append?: boolean } = {}
  ) => {
    const append = options.append === true;
    if (append) {
      setIsFetchingMoreBank(true);
    } else {
      setIsSyncingBank(true);
      setDuplicateWarnings(new Set());
      setAlreadyImportedRows([]);
      setNextBankSyncCursor(null);
      setNextBankSyncConnectionId(null);
      setPredictions(new Map());
    }

    try {
      const result = await syncTransactions({
        bankConnectionId,
        ...(cursor ? { cursor } : {}),
      });

      applyBankBatch(result.transactions, append, bankConnectionId);
      setBankSyncReviewConnectionId(bankConnectionId);
      setIsReviewOpen(true);

      if (result.hasMore && result.nextCursor) {
        setNextBankSyncCursor(result.nextCursor);
        setNextBankSyncConnectionId(bankConnectionId);
        notify("More Available", "More bank transactions are available. Fetch the next batch before importing if you want to include them in this review.");
      } else {
        setNextBankSyncCursor(null);
        setNextBankSyncConnectionId(null);
        if (result.hasMore) {
          notify("More Available", "More bank transactions may be available, but the bank did not return a resume point. Import or discard this batch before syncing again.");
        }
      }
    } catch (error: any) {
      console.error("Bank sync error:", error);
      notify("Error", error.message || "Failed to sync transactions from bank. Please try again.");
    } finally {
      if (append) {
        setIsFetchingMoreBank(false);
      } else {
        setIsSyncingBank(false);
      }
    }
  };

  const fetchNextBankBatch = async () => {
    if (!nextBankSyncConnectionId || !nextBankSyncCursor) return;
    await syncFromBank(nextBankSyncConnectionId, nextBankSyncCursor, { append: true });
  };

  const categorise = () => runCategorisation({
    rows,
    runCounter: categorisationRun,
    funds,
    categories,
    suggest: (transactions) => categorizeWithPipeline({ transactions }),
    setRows,
    setPredictions,
    setCount: setCategorisingCount,
    setStatus: setStatusMessage,
    setIsCategorising,
  });

  const confirm = async (): Promise<ConfirmImportResult> => {
    const outcome = await runConfirmImport({
      pendingRows: rows,
      alreadyImportedRows,
      isCategorising,
      bankSyncReviewConnectionId,
      hasMoreBankRows,
      funds,
      categories,
      ledger: ledgerRows,
      predictions,
      onPledgeCompleted,
    }, {
      notify,
      setRows,
      bulkCreate: bulkCreateTransactions,
      acknowledgeBankSync,
      recordCorrections,
      linkTransactions,
    });
    if (outcome.ok) clear();
    return outcome;
  };

  return {
    isReviewOpen,
    openReview,
    rows,
    duplicateWarnings,
    alreadyImportedRows,
    predictions,
    isCategorising,
    categorisingCount,
    statusMessage,
    isSyncingBank,
    isFetchingMoreBank,
    hasMoreBankRows,
    startStatementReview,
    syncFromBank,
    fetchNextBankBatch,
    updateRow,
    removeRow,
    assignFundToAll,
    includeAlreadyImported,
    pairing,
    categorise,
    confirm,
    clear,
  };
}
