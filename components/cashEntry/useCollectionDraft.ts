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
  missingFundLines,
  newDraft,
  parseStoredDraft,
  pruneStoredDraft,
  toPayload,
  type CollectionDraft,
  type DraftAction,
  type DraftTotals,
  type FundLine,
  type LedgerContext,
  type ProgrammeLine,
  type StoredDraft,
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

export interface SavedResult {
  cashCollectionId: string;
  status: SaveStatus;
  // The submitted draft and its totals, so the Done screen can't drift from what was saved.
  draft: CollectionDraft;
  totals: DraftTotals;
}

export interface WizardModel {
  draft: CollectionDraft;
  dispatch: (action: DraftAction) => void;
  toggleService: (presetId: string) => void;
  ctx: LedgerContext;
  funds: Fund[];
  programmes: ProgrammeOption[];
  // Fund lines whose fund is gone; saving is blocked while there are any.
  missingFunds: ReturnType<typeof missingFundLines>;
  fundById: (fundId: string) => Fund | undefined;
  fundName: (fundId: string) => string;
  programmeName: (programmeId: string) => string;
  fundLineLabel: (line: FundLine) => string;
  programmeLineLabel: (line: ProgrammeLine) => string;
  createFund: (name: string, type: FundTypeChoice) => Promise<string>;
  createProgramme: (name: string) => Promise<string>;
}

export interface ProgrammeOption {
  _id: string;
  name: string;
  isArchived?: boolean;
}

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

// Keyed by user, so a shared device never offers one person's count to another.
const draftKeyFor = (scope: string) => `churchcoin:cash-draft:v2:${scope}`;
const recentFundsKeyFor = (scope: string) => `churchcoin:cash-recent-funds:v2:${scope}`;

function readJson<T>(key: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Returns whether the value was written, so autosave can say when it could not.
function writeJson(key: string, value: unknown): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage can be full or disabled; the draft still lives in memory.
    return false;
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

function readRaw(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseStoredJson(raw: string): StoredDraft | null {
  try {
    return parseStoredDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

// A stored draft that fails validation is removed so it can't block the wizard again.
function readStoredDraft(key: string): StoredDraft | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  const stored = parseStoredJson(raw);
  if (!stored) removeKey(key);
  return stored;
}

// A count may write when the key is empty or already holds this count. Anything
// else is another tab's draft, which must not be overwritten.
const canWriteDraft = (key: string, draftId: string) => {
  const raw = readRaw(key);
  return raw === null || parseStoredJson(raw)?.draftId === draftId;
};

// Removes the stored copy only when it is the count given, so another tab's draft survives.
function removeOwnedDraft(key: string, draftId: string) {
  const raw = readRaw(key);
  if (raw !== null && parseStoredJson(raw)?.draftId === draftId) removeKey(key);
}

function readRecentFundIds(key: string): string[] {
  const ids = readJson<unknown>(key);
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
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
  storageScope: string;
}

// One hook owns the draft, its autosave (new collections only), the reference
// data the screens need, and the two mutations. Edit mode never touches
// localStorage: it loads the saved collection and replaces its entries.
export function useCollectionDraft({
  funds,
  categories,
  initialCollection,
  storageScope,
}: UseCollectionDraftOptions) {
  const isEdit = initialCollection !== undefined;
  const draftKey = draftKeyFor(storageScope);
  const recentKey = recentFundsKeyFor(storageScope);
  const ctx = useMemo(() => buildContext(funds, categories), [funds, categories]);

  const currentUsualFundIds = useCallback(
    () =>
      readRecentFundIds(recentKey).filter(
        (id) => id !== ctx.generalFundId && funds.some((fund) => fund._id === id)
      ),
    [recentKey, ctx.generalFundId, funds]
  );

  const [draft, dispatchRaw] = useReducer(reduceWizard, undefined, () =>
    initialCollection
      ? fromLedger(initialCollection, ctx)
      : newDraft(getWeekEndingSunday(new Date()), currentUsualFundIds())
  );

  // The stored draft offered on the Start screen. Edit mode never has one.
  const [offer, setOffer] = useState<StoredDraft | null>(() =>
    isEdit ? null : readStoredDraft(draftKey)
  );
  // A stored copy the user hasn't resumed or discarded. Autosave must not overwrite it.
  const storedUnresolved = useRef(offer !== null);
  // Names this count in storage. Resuming adopts the stored copy's id.
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const touched = useRef(false);
  const submitting = useRef(false);
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const programmeRows = useQuery(api.queries.programmes.list, { includeArchived: true });
  // Only needed to check a stored draft's donors before it is resumed.
  const donorRows = useQuery(api.queries.donors.list, offer && !isEdit ? {} : "skip");
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

  const programmes = useMemo<ProgrammeOption[]>(() => programmeRows ?? [], [programmeRows]);
  const fundIds = useMemo(() => new Set(funds.map((fund) => fund._id)), [funds]);
  const missingFunds = useMemo(() => missingFundLines(draft, fundIds), [draft, fundIds]);

  // Writes only into an empty key or this count's own copy. Emptying the count
  // removes its own copy, but a stored draft this count doesn't own is left alone.
  useEffect(() => {
    if (isEdit || !touched.current || saved || storedUnresolved.current) return;
    if (!hasEntries(draft)) {
      removeOwnedDraft(draftKey, draftId);
      setAutosaveFailed(false);
      return;
    }
    if (!canWriteDraft(draftKey, draftId)) {
      setAutosaveFailed(true);
      return;
    }
    setAutosaveFailed(!writeJson(draftKey, { savedAt: new Date().toISOString(), draftId, draft } satisfies StoredDraft));
  }, [draft, draftId, draftKey, isEdit, saved]);
  const fundById = useCallback((fundId: string) => funds.find((fund) => fund._id === fundId), [funds]);
  const fundName = useCallback((fundId: string) => fundById(fundId)?.name ?? "Fund", [fundById]);
  const programmeName = useCallback(
    (programmeId: string) => programmes.find((programme) => programme._id === programmeId)?.name ?? "Programme",
    [programmes]
  );
  const fundLineLabel = useCallback(
    (line: FundLine) =>
      line.category ? `${fundName(line.fundId)} · ${line.category}` : fundName(line.fundId),
    [fundName]
  );
  const programmeLineLabel = useCallback(
    (line: ProgrammeLine) =>
      [
        programmeName(line.programmeId),
        line.fundId && line.fundId !== ctx.generalFundId ? fundName(line.fundId) : null,
        line.category && line.category !== ctx.offeringCategory ? line.category : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" · "),
    [programmeName, fundName, ctx.generalFundId, ctx.offeringCategory]
  );

  const createFund = useCallback(
    async (name: string, type: FundTypeChoice) => createFundMutation({ name: name.trim(), type }),
    [createFundMutation]
  );
  const createProgramme = useCallback(
    async (name: string) => createProgrammeMutation({ name: name.trim() }),
    [createProgrammeMutation]
  );

  // Called when the user closes a count with entries and confirms the discard.
  const discardDraft = useCallback(() => {
    if (!isEdit) removeOwnedDraft(draftKey, draftId);
  }, [draftId, draftKey, isEdit]);

  const submit = async (status: SaveStatus): Promise<boolean> => {
    if (submitting.current) return false;
    submitting.current = true;
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
        removeOwnedDraft(draftKey, draftId);
        writeJson(recentKey, recentFundIdsOf(draft, ctx.generalFundId));
      }
      const totals = draftTotals(draft, ctx);
      notify(
        "Giving recorded",
        status === "submitted"
          ? `${gbp(totals.grand)} recorded for w/e ${payload.weekEndingDate}.`
          : `${gbp(totals.grand)} saved for later.`
      );
      setSaved({ cashCollectionId: result.cashCollectionId, status, draft, totals });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save collection");
      return false;
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  // Stored drafts are offered only once the donors, funds and programmes they
  // refer to have loaded, so resuming can drop the ones that have gone.
  const referenceReady = programmeRows !== undefined && donorRows !== undefined;
  const resumable = referenceReady ? offer : null;

  const resume = () => {
    if (!offer || !referenceReady) return;
    const pruned = pruneStoredDraft(offer.draft, {
      fundIds: new Set(funds.map((fund) => fund._id)),
      programmeIds: new Set(programmes.map((programme) => programme._id)),
      donorIds: new Set((donorRows ?? []).map((donor) => donor._id)),
    });
    touched.current = true;
    storedUnresolved.current = false;
    setDraftId(offer.draftId);
    dispatchRaw({ type: "load", draft: pruned });
    setOffer(null);
  };

  // Removes the copy that was offered, not one another tab may have stored since.
  const discardStored = () => {
    if (offer) removeOwnedDraft(draftKey, offer.draftId);
    storedUnresolved.current = false;
    setOffer(null);
  };

  const startFresh = () => {
    touched.current = false;
    setDraftId(crypto.randomUUID());
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
    missingFunds,
    fundById,
    fundName,
    programmeName,
    fundLineLabel,
    programmeLineLabel,
    createFund,
    createProgramme,
  };

  return {
    isEdit,
    model,
    existingCount: isEdit ? 0 : existing?.length ?? 0,
    resumable,
    // True while an unanswered stored count exists, even before it can be offered.
    hasStoredDraft: offer !== null,
    resume,
    discardStored,
    discardDraft,
    startFresh,
    submit,
    saving,
    error,
    saved,
    autosaveFailed,
  };
}

export type CollectionDraftController = ReturnType<typeof useCollectionDraft>;
