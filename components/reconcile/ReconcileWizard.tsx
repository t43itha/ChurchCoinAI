import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import {
  canCompleteSession,
  computeClearedSplitPence,
  computeDifferencePence,
  parseBalance,
} from "../../lib/reconciliation";
import type { Fund } from "../../types";
import { gbp } from "../cashEntry/format";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnGhost, btnLg, btnPrimary, eyebrow } from "../wizard/ui";
import AccountStep, { type AccountValues } from "./AccountStep";
import BalancesStep, { type BalanceValues } from "./BalancesStep";
import FinishStep from "./FinishStep";
import ReconcileDone from "./ReconcileDone";
import ReconcileReceipt from "./ReconcileReceipt";
import TickStep from "./TickStep";
import { gapPounds, monthName } from "./format";
import {
  RAIL_ORDER,
  hasPendingEdits,
  holdsUnsavedEdits,
  previousMonthRange,
  previousStepFor,
  railStateFor,
  resolveStep,
  type ReconcileStepKind,
} from "./steps";

const LABELS: Record<(typeof RAIL_ORDER)[number], string> = {
  account: "Account & month",
  balances: "Statement balances",
  tick: "Tick off lines",
  finish: "Finish",
};

export interface ReconcileWizardProps {
  funds: Fund[];
  // Omitted for a new reconciliation. Set to open one that already exists.
  sessionId?: Id<"reconciliationSessions">;
  // Test-only: opens at a later step. The product opens from the session's status (see startStepFor).
  initialStep?: ReconcileStepKind;
  onClose: () => void;
}

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

// Walkthrough for one statement: pick the account and month, enter the balances, tick the
// lines on the paper statement, then finish once the gap is zero. Each change is saved as it happens.
export default function ReconcileWizard({ funds, sessionId: initialSessionId, initialStep, onClose }: ReconcileWizardProps) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [position, setPosition] = useState<ReconcileStepKind | null>(initialStep ?? null);
  // What has been typed or picked since the session was last loaded. Everything else comes from the session.
  const [edits, setEdits] = useState<Partial<AccountValues & BalanceValues>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const workspace = useQuery(api.queries.reconciliationSessions.workspace, sessionId ? { sessionId } : "skip");
  const sessions = useQuery(api.queries.reconciliationSessions.list);
  const createSession = useMutation(api.mutations.reconciliationSessions.create);
  const updateBalances = useMutation(api.mutations.reconciliationSessions.updateBalances);
  const setCleared = useMutation(api.mutations.reconciliationSessions.setCleared);
  const completeSession = useMutation(api.mutations.reconciliationSessions.complete);
  const reopenSession = useMutation(api.mutations.reconciliationSessions.reopen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const loading = sessionId !== undefined && workspace === undefined;
  const missing = sessionId !== undefined && workspace === null;
  const session = workspace?.session ?? null;
  const isCompleted = session?.status === "completed";

  const base: AccountValues & BalanceValues = session
    ? {
        fundId: session.fundId,
        periodStart: session.periodStart,
        periodEnd: session.periodEnd,
        opening: String(session.statementOpeningBalance),
        closing: String(session.statementClosingBalance),
      }
    : { fundId: "", ...previousMonthRange(formatLocalDateInputValue(new Date())), opening: "", closing: "" };
  const values = { ...base, ...edits };
  const fund = funds.find((candidate) => candidate._id === values.fundId);

  // The open reconciliation for this fund, other than the one already on screen.
  const openSession = sessions?.find(
    (candidate) =>
      candidate.fundId === values.fundId && candidate.status !== "completed" && candidate._id !== sessionId
  );

  // A completed session opens on its summary, but its steps stay open to browse read-only.
  const step: ReconcileStepKind = resolveStep(position, session?.status ?? null);
  const stepPosition = step === "done" ? RAIL_ORDER.length : RAIL_ORDER.indexOf(step);
  const previous = previousStepFor(step, isCompleted);

  // Amounts are compared in pence on the server, so the walkthrough reads the saved balances once they exist.
  const opening = session ? session.statementOpeningBalance : parseBalance(values.opening);
  const closing = session ? session.statementClosingBalance : parseBalance(values.closing);
  const split = workspace ? computeClearedSplitPence(workspace.cleared) : null;
  const differencePence =
    session && workspace
      ? computeDifferencePence(session.statementOpeningBalance, session.statementClosingBalance, workspace.cleared)
      : null;
  const gapText = differencePence === null ? "—" : gbp(gapPounds(differencePence));

  const title = values.periodStart ? `Reconcile ${monthName(values.periodStart)}` : "Reconcile";

  const go = (target: ReconcileStepKind) => {
    if (saving) return;
    setError(null);
    setPosition(target);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  // Leaving the account or balances step by any route but its Next button discards the unsaved
  // edits, so completing never runs against stale saved values. Ask first; cancelling stays put.
  const pendingEdits = hasPendingEdits(edits, base);
  const confirmDiscard = () =>
    !(holdsUnsavedEdits(step) && pendingEdits) || window.confirm("Discard your changes to the statement?");
  const leave = (target: ReconcileStepKind) => {
    if (target === step || saving || !confirmDiscard()) return;
    setEdits({});
    go(target);
  };

  const continueSession = (id: Id<"reconciliationSessions">) => {
    if (!confirmDiscard()) return;
    setSessionId(id);
    setEdits({});
    setError(null);
    setPosition("tick");
  };

  // The first save creates the session. Later saves send the whole balance block, which the server patches.
  const saveBalances = async () => {
    const openingValue = parseBalance(values.opening);
    const closingValue = parseBalance(values.closing);
    if (openingValue === null || closingValue === null) {
      setError("Enter both balances as amounts, like 1250.40.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (sessionId === undefined) {
        const id = await createSession({
          fundId: values.fundId as Id<"funds">,
          periodStart: values.periodStart,
          periodEnd: values.periodEnd,
          statementOpeningBalance: openingValue,
          statementClosingBalance: closingValue,
        });
        setSessionId(id);
      } else {
        await updateBalances({
          sessionId,
          statementOpeningBalance: openingValue,
          statementClosingBalance: closingValue,
          periodStart: values.periodStart,
          periodEnd: values.periodEnd,
        });
      }
      setEdits({});
      setPosition("tick");
    } catch (err) {
      setError(messageOf(err, "Could not save the balances."));
    } finally {
      setSaving(false);
    }
  };

  const toggleLine = async (transactionId: Id<"transactions">, ticked: boolean) => {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    try {
      await setCleared({ sessionId, transactionId, cleared: ticked });
    } catch (err) {
      setError(messageOf(err, "Could not update that line."));
    } finally {
      setSaving(false);
    }
  };

  const completeReconciliation = async () => {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    try {
      await completeSession({ sessionId });
      setPosition("done");
    } catch (err) {
      setError(messageOf(err, "Could not complete the reconciliation."));
    } finally {
      setSaving(false);
    }
  };

  const reopen = async (reason: string) => {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    try {
      await reopenSession({ sessionId, reason });
      setPosition("tick");
    } catch (err) {
      setError(messageOf(err, "Could not reopen the reconciliation."));
    } finally {
      setSaving(false);
    }
  };

  const accountReady =
    values.fundId !== "" &&
    values.periodStart !== "" &&
    values.periodEnd !== "" &&
    values.periodEnd >= values.periodStart &&
    sessions !== undefined &&
    openSession === undefined;

  const balancesReady = parseBalance(values.opening) !== null && parseBalance(values.closing) !== null;

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (loading) {
    body = <p className="p-8 text-center text-sm text-grey-mid">Loading the reconciliation…</p>;
  } else if (missing) {
    body = <p className="p-8 text-center text-sm text-grey-mid">This reconciliation could not be found.</p>;
  } else if (step === "account") {
    body = (
      <AccountStep
        funds={funds}
        values={values}
        fundLocked={session !== null}
        openSession={openSession}
        onChange={(patch) => setEdits((current) => ({ ...current, ...patch }))}
        onContinue={continueSession}
      />
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={!accountReady} onClick={() => go("balances")} className={`${btnPrimary} ${btnLg}`}>
          Next: statement balances →
        </button>
      </StepFooter>
    );
  } else if (step === "balances") {
    body = (
      <BalancesStep
        values={values}
        disabled={isCompleted}
        onChange={(patch) => setEdits((current) => ({ ...current, ...patch }))}
      />
    );
    footer = (
      <StepFooter>
        {isCompleted ? (
          // Nothing to save on a completed session, so this only moves along the rail.
          <button type="button" onClick={() => go("tick")} className={`${btnPrimary} ${btnLg}`}>
            Next: tick off lines →
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || !balancesReady}
            onClick={() => void saveBalances()}
            className={`${btnPrimary} ${btnLg}`}
          >
            Next: tick off lines →
          </button>
        )}
      </StepFooter>
    );
  } else if (step === "tick" && workspace) {
    body = (
      <TickStep
        cleared={workspace.cleared}
        candidates={workspace.candidates}
        disabled={isCompleted}
        onToggle={(transactionId, ticked) => void toggleLine(transactionId, ticked)}
      />
    );
    footer = (
      <StepFooter label="Gap" value={gapText}>
        <button type="button" onClick={() => go("finish")} className={`${btnPrimary} ${btnLg}`}>
          Next: finish →
        </button>
      </StepFooter>
    );
  } else if (step === "finish" && differencePence !== null) {
    body = <FinishStep differencePence={differencePence} completed={isCompleted} onGo={leave} />;
    footer = isCompleted ? (
      <StepFooter>
        <button type="button" onClick={() => go("done")} className={`${btnPrimary} ${btnLg}`}>
          Back to summary
        </button>
      </StepFooter>
    ) : (
      <StepFooter>
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={saving || pendingEdits || !canCompleteSession(differencePence)}
            onClick={() => void completeReconciliation()}
            className={`${btnPrimary} ${btnLg}`}
          >
            Complete reconciliation
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>
            Save and finish later
          </button>
        </div>
      </StepFooter>
    );
  } else if (step === "done" && workspace) {
    body = (
      <ReconcileDone
        month={monthName(workspace.session.periodStart)}
        fundName={fund?.name ?? "Unknown fund"}
        periodStart={workspace.session.periodStart}
        periodEnd={workspace.session.periodEnd}
        lineCount={workspace.cleared.length}
        closing={workspace.session.statementClosingBalance}
        onViewTicks={() => leave("tick")}
        onReopen={(reason) => void reopen(reason)}
        onClose={onClose}
      />
    );
  }

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>{fund?.name ?? "New reconciliation"}</div>
      {RAIL_ORDER.map((kind, index) => {
        const state = railStateFor(kind, step);
        return (
          <RailStep
            key={kind}
            marker={String(index + 1)}
            label={LABELS[kind]}
            trailing={kind === "tick" && workspace ? String(workspace.cleared.length) : undefined}
            state={state}
            // A completed session can be read from balances onward, but its account is locked.
            disabled={isCompleted ? kind === "account" : state === "todo"}
            onClick={() => leave(kind)}
          />
        );
      })}
    </aside>
  );

  const receipt =
    step === "done" ? undefined : (
      <ReconcileReceipt opening={opening} closing={closing} split={split} differencePence={differencePence} />
    );

  // Shown once above the steps that can change the reconciliation, so the reason stays in view.
  const reopenedNote =
    session?.status === "reopened" &&
    session.reopenedReason &&
    (step === "balances" || step === "tick" || step === "finish") ? (
      <p className="mb-4 rounded-2xl bg-amber-light px-3.5 py-2.5 text-sm text-amber">
        {`Reopened: ${session.reopenedReason}`}
      </p>
    ) : null;

  return (
    <WizardFrame
      ariaLabel="Reconcile"
      title={title}
      // Locks every control while a save is in flight, so a change can't be repeated or overtaken.
      locked={saving}
      onClose={onClose}
      onBack={previous ? () => leave(previous) : undefined}
      progress={{ total: RAIL_ORDER.length, current: stepPosition }}
      rail={rail}
      receipt={receipt}
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
