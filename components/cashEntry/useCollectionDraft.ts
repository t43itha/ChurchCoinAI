import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TransactionType, type Fund } from "../../types";
import { categoryNamesForTransactionTypes } from "../../lib/transactionCategories";
import { isMovementCategory, type MovementKind } from "../../lib/movementCategories";
import { getWeekEndingSunday } from "../../lib/dateUtils";
import { notify } from "../../lib/notifications";
import type { InPersonGivingLedger } from "../../lib/inPersonGiving";
import {
  draftReducer,
  draftTotals,
  fromLedger,
  hasEntries,
  newDraft,
  toPayload,
  type CollectionDraft,
  type DraftAction,
  type LedgerContext,
} from "../../lib/cashCollectionDraft";
import { gbp } from "./format";

export interface CategoryOption {
  _id: string;
  name: string;
  transactionType?: TransactionType;
  movementKind?: MovementKind;
}

export type FundTypeChoice = "Designated" | "Restricted";
export type SaveStatus = "draft" | "submitted";

export interface StoredDraft {
  savedAt: string;
  draft: CollectionDraft;
}

export interface SavedResult {
  cashCollectionId: string;
  status: SaveStatus;
}

export interface WizardModel {
  draft: CollectionDraft;
  dispatch: (action: DraftAction) => void;
  toggleService: (presetId: string) => void;
  ctx: LedgerContext;
  funds: Fund[];
  programmes: ProgrammeOption[];
  fundById: (fundId: string) => Fund | undefined;
  fundName: (fundId: string) => string;
  programmeName: (programmeId: string) => string;
  createFund: (name: string, type: FundTypeChoice) => Promise<string>;
  createProgramme: (name: string) => Promise<string>;
}

export interface ProgrammeOption {
  _id: string;
  name: string;
  isArchived?: boolean;
}

const DRAFT_KEY = "churchcoin:cash-draft:v1";
const RECENT_FUNDS_KEY = "churchcoin:cash-recent-funds:v1";

// Only the draft-level actions reach the reducer; `load` swaps in a whole draft
// (resume, or a fresh week) without a per-field action.
type WizardAction = DraftAction | { type: "load"; draft: CollectionDraft };

function reduceWizard(state: CollectionDraft, action: WizardAction): CollectionDraft {
  return action.type === "load" ? action.draft : draftReducer(state, action);
}

function buildContext(funds: Fund[], categories: CategoryOption[]): LedgerContext {
  const general = funds.find((fund) => fund.type === "Unrestricted") ?? funds[0];
  const validIncome = new Set(categoryNamesForTransactionTypes(categories, [TransactionType.INCOME]));
  const incomeNames = categories
    .filter((category) => validIncome.has(category.name) && !isMovementCategory(category))
    .map((category) => category.name);
  const offeringCategory = incomeNames.find((name) => name.toLowerCase() === "offerings") ?? "Offerings";
  const titheCategory = incomeNames.find((name) => /tithe/i.test(name)) ?? offeringCategory;
  return { generalFundId: general?._id ?? "", offeringCategory, titheCategory };
}

function readJson<T>(key: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or disabled; the draft still lives in memory.
  }
}

function removeKey(key: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing else to do: the stale copy is harmless.
  }
}

function readStoredDraft(): StoredDraft | null {
  const stored = readJson<StoredDraft>(DRAFT_KEY);
  return stored?.draft?.services && hasEntries(stored.draft) ? stored : null;
}

function readRecentFundIds(): string[] {
  const ids = readJson<string[]>(RECENT_FUNDS_KEY);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

function recentFundIdsOf(draft: CollectionDraft, generalFundId: string): string[] {
  const ids = new Set<string>();
  for (const service of draft.services) {
    for (const line of service.funds) {
      if (line.fundId !== generalFundId) ids.add(line.fundId);
    }
  }
  return [...ids];
}

export interface UseCollectionDraftOptions {
  funds: Fund[];
  categories: CategoryOption[];
  initialCollection?: InPersonGivingLedger;
}

// One hook owns the draft, its autosave (new collections only), the reference
// data the screens need, and the two mutations. Edit mode never touches
// localStorage: it loads the saved collection and replaces its entries.
export function useCollectionDraft({ funds, categories, initialCollection }: UseCollectionDraftOptions) {
  const isEdit = initialCollection !== undefined;
  const ctx = useMemo(() => buildContext(funds, categories), [funds, categories]);

  const currentUsualFundIds = useCallback(
    () => readRecentFundIds().filter((id) => id !== ctx.generalFundId && funds.some((fund) => fund._id === id)),
    [ctx.generalFundId, funds]
  );

  const [draft, dispatchRaw] = useReducer(reduceWizard, undefined, () =>
    initialCollection
      ? fromLedger(initialCollection, ctx)
      : newDraft(getWeekEndingSunday(new Date()), currentUsualFundIds())
  );

  // Autosave only after the user has changed something, so a fresh screen
  // never overwrites a stored draft before the banner is answered.
  const touched = useRef(false);
  const [resumable, setResumable] = useState<StoredDraft | null>(() =>
    isEdit ? null : readStoredDraft()
  );
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const programmeRows = useQuery(api.queries.programmes.list, { includeArchived: true });
  const existing = useQuery(
    api.queries.cashCollections.getByWeekEnding,
    isEdit ? "skip" : { weekEndingDate: draft.weekEndingDate }
  );
  const submitCollection = useMutation(api.mutations.cashCollections.submitCollection);
  const replaceCollectionEntries = useMutation(api.mutations.cashCollections.replaceCollectionEntries);
  const createProgrammeMutation = useMutation(api.mutations.programmes.create);
  const createFundMutation = useMutation(api.mutations.funds.create);

  const dispatch = useCallback((action: DraftAction) => {
    touched.current = true;
    dispatchRaw(action);
  }, []);

  const toggleService = useCallback(
    (presetId: string) => dispatch({ type: "toggleService", presetId, usualFundIds: currentUsualFundIds() }),
    [dispatch, currentUsualFundIds]
  );

  useEffect(() => {
    if (isEdit || !touched.current || saved || resumable) return;
    if (hasEntries(draft)) {
      writeJson(DRAFT_KEY, { savedAt: new Date().toISOString(), draft } satisfies StoredDraft);
    } else {
      removeKey(DRAFT_KEY);
    }
  }, [draft, isEdit, resumable, saved]);

  const programmes = useMemo<ProgrammeOption[]>(() => programmeRows ?? [], [programmeRows]);
  const fundById = useCallback((fundId: string) => funds.find((fund) => fund._id === fundId), [funds]);
  const fundName = useCallback((fundId: string) => fundById(fundId)?.name ?? "Fund", [fundById]);
  const programmeName = useCallback(
    (programmeId: string) => programmes.find((programme) => programme._id === programmeId)?.name ?? "Programme",
    [programmes]
  );

  const createFund = useCallback(
    async (name: string, type: FundTypeChoice) => createFundMutation({ name: name.trim(), type }),
    [createFundMutation]
  );
  const createProgramme = useCallback(
    async (name: string) => createProgrammeMutation({ name: name.trim() }),
    [createProgrammeMutation]
  );

  const discardDraft = useCallback(() => {
    if (!isEdit) removeKey(DRAFT_KEY);
  }, [isEdit]);

  const submit = async (status: SaveStatus): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(draft, ctx);
      if (payload.serviceRows.length === 0 && payload.namedDonations.length === 0) {
        throw new Error("Add at least one amount before saving.");
      }
      const args = {
        weekEndingDate: payload.weekEndingDate,
        collectionDate: payload.collectionDate,
        notes: payload.notes,
        status,
        serviceRows: payload.serviceRows.map((row) => ({
          ...row,
          fundId: row.fundId as Id<"funds">,
          programmeId: row.programmeId as Id<"programmes"> | undefined,
        })),
        namedDonations: payload.namedDonations.map((donation) => ({
          ...donation,
          fundId: donation.fundId as Id<"funds">,
          donorId: donation.donorId as Id<"donors"> | undefined,
        })),
      };
      const result = initialCollection
        ? await replaceCollectionEntries({
            cashCollectionId: initialCollection.collectionId as Id<"cashCollections">,
            ...args,
            // Tells the server this client sends full detail, so it accepts the replace.
            entryFormat: 2,
          })
        : await submitCollection(args);

      if (!isEdit) {
        removeKey(DRAFT_KEY);
        writeJson(RECENT_FUNDS_KEY, recentFundIdsOf(draft, ctx.generalFundId));
      }
      const total = draftTotals(draft, ctx).grand;
      notify(
        "Giving recorded",
        status === "submitted"
          ? `${gbp(total)} recorded for w/e ${payload.weekEndingDate}.`
          : `${gbp(total)} saved for later.`
      );
      setSaved({ cashCollectionId: result.cashCollectionId, status });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save collection");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resume = () => {
    if (!resumable) return;
    touched.current = true;
    dispatchRaw({ type: "load", draft: resumable.draft });
    setResumable(null);
  };

  const discardStored = () => {
    removeKey(DRAFT_KEY);
    setResumable(null);
  };

  // Moving past the start screen without resuming keeps the stored copy until
  // the user edits something, so an accidental tap never deletes it.
  const dismissResumable = () => setResumable(null);

  const startFresh = () => {
    removeKey(DRAFT_KEY);
    touched.current = false;
    setSaved(null);
    setError(null);
    dispatchRaw({ type: "load", draft: newDraft(getWeekEndingSunday(new Date()), currentUsualFundIds()) });
  };

  const model: WizardModel = {
    draft,
    dispatch,
    toggleService,
    ctx,
    funds,
    programmes,
    fundById,
    fundName,
    programmeName,
    createFund,
    createProgramme,
  };

  return {
    isEdit,
    model,
    existingCount: isEdit ? 0 : existing?.length ?? 0,
    resumable,
    resume,
    discardStored,
    dismissResumable,
    discardDraft,
    startFresh,
    submit,
    saving,
    error,
    saved,
  };
}

export type CollectionDraftController = ReturnType<typeof useCollectionDraft>;
