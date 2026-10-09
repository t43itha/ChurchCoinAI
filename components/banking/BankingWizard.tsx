import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { sumMoney } from "../../convex/lib/money";
import { toPence } from "../../lib/reconciliation";
import { notify } from "../../lib/notifications";
import type { CashBankingVarianceType, Fund } from "../../types";
import { gbp } from "../cashEntry/format";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, eyebrow } from "../wizard/ui";
import BankingDone, { type BankedSummary } from "./BankingDone";
import BankingReceipt from "./BankingReceipt";
import BankStep from "./BankStep";
import CheckStep from "./CheckStep";
import CollectionsStep from "./CollectionsStep";
import {
  EMPTY_SEED,
  buildBankingView,
  creditDraftForMedium,
  defaultCollectionAmounts,
  defaultCreditDraft,
  mediumOf,
  seedFromBanking,
  settleSelection,
  type AmountDraft,
  type BankCredit,
  type CreditDraft,
  type MediumChoice,
  type OpenCollection,
} from "./draft";
import { differenceText } from "./format";
import {
  RAIL_ORDER,
  previousStepFor,
  railStateFor,
  resolveStep,
  stepReady,
  type BankingStepKind,
  type StepFacts,
} from "./steps";

const LABELS: Record<BankingStepKind, string> = {
  collections: "Collections",
  bank: "Find it in the bank",
  check: "Check",
  done: "Done",
};

const TITLE = "Bank cash and cheques";

export interface BankingWizardProps {
  funds: Fund[];
  // A reopened banking to continue, preloaded with what it saved. Omitted for a new deposit.
  reconciliation?: Doc<"cashBankingReconciliations">;
  // Test-only: opens at a later step. The product always opens on Collections.
  initialStep?: BankingStepKind;
  onClose: () => void;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

const toggled = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

// Walkthrough for one deposit: pick the collections, find the bank credit, check the two agree,
// then complete. Nothing is saved until the last step, so closing before it discards the picks.
export default function BankingWizard({ funds, reconciliation, initialStep, onClose }: BankingWizardProps) {
  const [seed] = useState(() => (reconciliation ? seedFromBanking(reconciliation) : EMPTY_SEED));
  const [editingId, setEditingId] = useState<Id<"cashBankingReconciliations"> | null>(reconciliation?._id ?? null);
  const [position, setPosition] = useState<BankingStepKind | null>(initialStep ?? null);
  // Null until the collections first load; settleSelection then ticks them all, once.
  const [selection, setSelection] = useState<Set<string> | null>(() =>
    seed.collectionSelection ? new Set(seed.collectionSelection) : null
  );
  const [overrides, setOverrides] = useState<Record<string, AmountDraft>>(seed.collectionOverrides);
  const [creditSelection, setCreditSelection] = useState<Set<string>>(() => new Set(seed.creditSelection));
  const [creditDrafts, setCreditDrafts] = useState<Record<string, CreditDraft>>(seed.creditDrafts);
  const [search, setSearch] = useState("");
  const [varianceType, setVarianceType] = useState<CashBankingVarianceType | "">(seed.varianceType);
  const [varianceNote, setVarianceNote] = useState(seed.varianceNote);
  // Set by the user's own changes, so closing an untouched reopened banking does not ask.
  const [dirty, setDirty] = useState(false);
  const [completed, setCompleted] = useState<BankedSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const awaiting = useQuery(api.queries.cashBankingReconciliations.getAwaitingBanking, {});
  const candidates = useQuery(
    api.queries.cashBankingReconciliations.getCandidateBankCredits,
    editingId ? { includeReconciliationId: editingId } : {}
  );
  const createDraft = useMutation(api.mutations.cashBankingReconciliations.createDraft);
  const updateDraft = useMutation(api.mutations.cashBankingReconciliations.updateDraft);
  const completeBanking = useMutation(api.mutations.cashBankingReconciliations.complete);

  // Freezes the ticks at the first load, so a collection that arrives later does not get picked up unseen.
  useEffect(() => {
    if (awaiting !== undefined) setSelection((current) => settleSelection(current, awaiting));
  }, [awaiting]);

  const loading = awaiting === undefined;
  const collections = awaiting ?? [];
  const credits = candidates ?? [];
  const isTicked = (collectionId: string) => selection === null || selection.has(collectionId);
  const pickedCollections = collections.filter((collection) => isTicked(collection._id));
  const pickedCredits = credits.filter((credit) => creditSelection.has(credit._id));
  const view = buildBankingView({
    collections: pickedCollections,
    overrides,
    credits: pickedCredits,
    creditDrafts,
  });
  const facts: StepFacts = {
    selectedCollections: pickedCollections.length,
    collectionErrors: Object.keys(view.collectionErrors).length,
    selectedCredits: pickedCredits.length,
    creditErrors: Object.keys(view.creditErrors).length,
    variance: view.variance,
    varianceType,
    varianceNote,
  };

  const step = resolveStep(position, completed !== null);
  const stepPosition = step === "done" ? RAIL_ORDER.length : RAIL_ORDER.indexOf(step);
  const previous = previousStepFor(step);
  const continuing = reconciliation !== undefined && editingId === reconciliation._id;

  const go = (target: BankingStepKind) => {
    if (saving) return;
    setError(null);
    setPosition(target);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty && completed === null && !window.confirm("Leave banking? What you have ticked isn't saved yet.")) return;
    onClose();
  }, [saving, dirty, completed, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const edited = () => {
    setDirty(true);
    setError(null);
  };

  const toggleCollection = (collectionId: string) => {
    edited();
    // Unticking a collection drops any part-amounts typed for it.
    if (isTicked(collectionId)) setOverrides((current) => without(current, collectionId));
    setSelection((current) => toggled(settleSelection(current, collections), collectionId));
  };

  const startPartial = (collection: OpenCollection) => {
    edited();
    setOverrides((current) => ({ ...current, [collection._id]: defaultCollectionAmounts(collection) }));
  };

  const useFullAmount = (collectionId: string) => {
    edited();
    setOverrides((current) => without(current, collectionId));
  };

  const setCollectionAmount = (collectionId: string, field: keyof AmountDraft, value: string) => {
    edited();
    setOverrides((current) => {
      const existing = current[collectionId];
      if (!existing) return current;
      return { ...current, [collectionId]: { ...existing, [field]: value } };
    });
  };

  const toggleCredit = (credit: BankCredit) => {
    edited();
    setCreditSelection((current) => toggled(current, credit._id));
  };

  const chooseMedium = (credit: BankCredit, choice: MediumChoice) => {
    edited();
    setCreditDrafts((current) => ({
      ...current,
      [credit._id]: creditDraftForMedium(
        credit,
        mediumOf(choice),
        current[credit._id] ?? defaultCreditDraft(credit)
      ),
    }));
  };

  const setCreditAmount = (credit: BankCredit, field: "cashAmount" | "chequeAmount", value: string) => {
    edited();
    setCreditDrafts((current) => ({
      ...current,
      [credit._id]: { ...(current[credit._id] ?? defaultCreditDraft(credit)), [field]: value },
    }));
  };

  const complete = async () => {
    const variance = view.variance;
    if (saving || variance === null || !stepReady("check", facts)) return;
    setSaving(true);
    setError(null);
    try {
      // Keep the id once created, so a retry after a failed save updates this draft instead of making another.
      const reconciliationId = editingId ?? (await createDraft({})).reconciliationId;
      setEditingId(reconciliationId);
      const hasVariance = toPence(variance) !== 0;
      await updateDraft({
        reconciliationId,
        cashCollectionSplits: view.collectionSplits.map((split) => ({
          cashCollectionId: split.cashCollectionId as Id<"cashCollections">,
          cashAmount: split.cashAmount,
          chequeAmount: split.chequeAmount,
        })),
        bankTransactionSplits: view.bankInputs.map((input) => ({
          transactionId: input.transactionId as Id<"transactions">,
          transactionAmount: input.transactionAmount,
          medium: input.medium,
          cashAmount: input.cashAmount,
          chequeAmount: input.chequeAmount,
        })),
        varianceType: hasVariance && varianceType !== "" ? varianceType : undefined,
        varianceNote: hasVariance && varianceNote.trim() !== "" ? varianceNote.trim() : undefined,
      });
      await completeBanking({ reconciliationId });
      notify("Banking Complete", "Cash/cheque banking has been reconciled.");
      setCompleted({
        bankedTotal: view.banked,
        variance,
        collectionCount: pickedCollections.length,
        creditCount: pickedCredits.length,
      });
      setPosition("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete cash/cheque banking.";
      setError(message);
      notify("Error", message);
    } finally {
      setSaving(false);
    }
  };

  // After a completed deposit, starts a fresh one. The reconciliation it was loaded from is no longer in play.
  const startAnother = () => {
    setPosition("collections");
    setSelection(null);
    setOverrides({});
    setCreditSelection(new Set());
    setCreditDrafts({});
    setSearch("");
    setVarianceType("");
    setVarianceNote("");
    setEditingId(null);
    setDirty(false);
    setCompleted(null);
    setError(null);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const trailingFor = (kind: BankingStepKind) => {
    if (kind === "collections") return String(pickedCollections.length);
    if (kind === "bank") return String(pickedCredits.length);
    return undefined;
  };

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>Paying in</div>
      {RAIL_ORDER.map((kind, index) => {
        const state = railStateFor(kind, step);
        return (
          <RailStep
            key={kind}
            marker={String(index + 1)}
            label={LABELS[kind]}
            trailing={trailingFor(kind)}
            state={state}
            // A completed deposit can only be left through its summary, so the earlier steps are closed.
            disabled={state === "todo" || (completed !== null && kind !== "done")}
            onClick={() => go(kind)}
          />
        );
      })}
    </aside>
  );

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (step === "collections") {
    body = (
      <CollectionsStep
        collections={collections}
        loading={loading}
        isTicked={isTicked}
        overrides={overrides}
        errors={view.collectionErrors}
        onToggle={toggleCollection}
        onPartial={startPartial}
        onFullAmount={useFullAmount}
        onAmount={setCollectionAmount}
      />
    );
    footer =
      !loading && collections.length === 0 ? (
        <StepFooter>
          <button type="button" onClick={requestClose} className={`${btnPrimary} ${btnLg}`}>
            Close
          </button>
        </StepFooter>
      ) : (
        <StepFooter label="Counted" value={gbp(view.counted)}>
          <button
            type="button"
            disabled={!stepReady("collections", facts)}
            onClick={() => go("bank")}
            className={`${btnPrimary} ${btnLg}`}
          >
            Next: find it in the bank →
          </button>
        </StepFooter>
      );
  } else if (step === "bank") {
    body = (
      <BankStep
        credits={credits}
        loading={candidates === undefined}
        funds={funds}
        search={search}
        onSearch={setSearch}
        isTicked={(creditId) => creditSelection.has(creditId)}
        drafts={creditDrafts}
        errors={view.creditErrors}
        onToggle={toggleCredit}
        onMedium={chooseMedium}
        onAmount={setCreditAmount}
      />
    );
    footer = (
      <StepFooter label="Difference" value={differenceText(view.variance)}>
        <button
          type="button"
          disabled={!stepReady("bank", facts)}
          onClick={() => go("check")}
          className={`${btnPrimary} ${btnLg}`}
        >
          Next: check it →
        </button>
      </StepFooter>
    );
  } else if (step === "check") {
    body = (
      <CheckStep
        counted={view.counted}
        collectionCount={pickedCollections.length}
        banked={view.banked}
        bankCount={pickedCredits.length}
        variance={view.variance}
        varianceType={varianceType}
        note={varianceNote}
        onVarianceType={(value) => {
          edited();
          setVarianceType(value);
        }}
        onNote={(value) => {
          edited();
          setVarianceNote(value);
        }}
      />
    );
    footer = (
      <StepFooter label="Difference" value={differenceText(view.variance)}>
        <button
          type="button"
          disabled={saving || !stepReady("check", facts)}
          onClick={() => void complete()}
          className={`${btnPrimary} ${btnLg}`}
        >
          Complete banking
        </button>
      </StepFooter>
    );
  } else if (step === "done" && completed) {
    body = (
      <BankingDone
        summary={completed}
        waitingCount={collections.length}
        waitingTotal={sumMoney(collections, (collection) => collection.openTotal)}
        onAnother={startAnother}
        onBack={onClose}
      />
    );
  }

  // Shown once above the steps that can change a reopened banking, so the reason stays in view.
  const reopenedNote =
    continuing && reconciliation?.status === "reopened" && reconciliation.reopenReason && step !== "done" ? (
      <p className="mb-4 rounded-2xl bg-amber-light px-3.5 py-2.5 text-sm text-amber">
        {`Reopened: ${reconciliation.reopenReason}`}
      </p>
    ) : null;

  return (
    <WizardFrame
      ariaLabel={TITLE}
      title={TITLE}
      // Locks every control while a save is in flight, so a change can't be repeated or overtaken.
      locked={saving}
      onClose={requestClose}
      onBack={previous ? () => go(previous) : undefined}
      progress={{ total: RAIL_ORDER.length, current: stepPosition }}
      rail={rail}
      receipt={
        step === "done" ? undefined : (
          <BankingReceipt collections={pickedCollections} bankCount={pickedCredits.length} view={view} />
        )
      }
      bodyRef={bodyRef}
      notice={
        error ? (
          <p role="alert" className="mx-4 mb-2 rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error lg:mx-8">
            {error}
          </p>
        ) : undefined
      }
      footer={footer}
    >
      {reopenedNote}
      {body}
    </WizardFrame>
  );
}
