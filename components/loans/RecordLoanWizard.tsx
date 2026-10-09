import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, LayoutList, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { formatUkDate } from "../../lib/dateUtils";
import type { LoanSummary } from "../../lib/movementMatching";
import { gbp } from "../cashEntry/format";
import DateInput from "../cashEntry/DateInput";
import RailStep, { type RailStepState } from "../wizard/RailStep";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import {
  btnLg,
  btnPrimary,
  eyebrow,
  fieldLabel,
  nextIcon,
  nextItem,
  screenHelp,
  screenTitle,
  tickBox,
  txtInput,
} from "../wizard/ui";
import {
  LOAN_RAIL_ORDER,
  loanProblem,
  loanSummary,
  newLoanArgs,
  receivedCandidates,
  repaymentCandidates,
  whoIsReady,
  type LoanStepKind,
  type LoanValues,
} from "./loanWalkthrough";

const LABELS: Record<(typeof LOAN_RAIL_ORDER)[number], string> = {
  who: "Who lent it",
  amount: "Amount received",
  repayments: "Repayments so far",
};

const PREVIOUS_STEP: Partial<Record<LoanStepKind, LoanStepKind>> = { amount: "who", repayments: "amount" };

const EMPTY_VALUES: LoanValues = { lender: "", dueDate: "", note: "" };

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

// Walkthrough for one loan: who lent it, which money they sent, and any repayments already made.
// The loan is created once, in one step, through the same link mutation the transactions page uses.
export default function RecordLoanWizard({ onClose }: { onClose: () => void }) {
  const transactions = useQuery(api.queries.transactions.list, {});
  const link = useMutation(api.mutations.movements.link);

  const [step, setStep] = useState<LoanStepKind>("who");
  const [values, setValues] = useState<LoanValues>(EMPTY_VALUES);
  const [receivedId, setReceivedId] = useState<string | null>(null);
  const [repaymentIds, setRepaymentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<{ lender: string; summary: LoanSummary; repayments: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const legs = transactions ?? [];
  const receivedOptions = receivedCandidates(legs);
  const repaymentOptions = repaymentCandidates(legs);
  const received = receivedOptions.find((leg) => leg._id === receivedId);
  const repayments = repaymentOptions.filter((leg) => repaymentIds.includes(leg._id));
  const problem = loanProblem(received, repayments);

  const index = step === "done" ? LOAN_RAIL_ORDER.length : LOAN_RAIL_ORDER.indexOf(step);
  const previous = PREVIOUS_STEP[step];

  const go = (target: LoanStepKind) => {
    if (saving) return;
    setError(null);
    setStep(target);
  };

  const toggleRepayment = (id: string) =>
    setRepaymentIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));

  const recordAnother = () => {
    setValues(EMPTY_VALUES);
    setReceivedId(null);
    setRepaymentIds([]);
    setRecorded(null);
    setError(null);
    setStep("who");
  };

  const record = async () => {
    if (!received || problem !== null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await link(newLoanArgs(values, received, repayments));
      setRecorded({
        lender: values.lender.trim(),
        summary: loanSummary(received, repayments),
        repayments: repayments.length,
      });
      setStep("done");
    } catch (err) {
      setError(messageOf(err, "Failed to record this loan."));
    } finally {
      setSaving(false);
    }
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (step === "who") {
    body = (
      <>
        <h2 className={screenTitle}>Who lent the money?</h2>
        <p className={screenHelp}>Record who lent it and, if there is one, when it is due back.</p>
        <div>
          <label htmlFor="loan-lender" className={fieldLabel}>
            Lender
          </label>
          <input
            id="loan-lender"
            type="text"
            value={values.lender}
            onChange={(event) => setValues({ ...values, lender: event.target.value })}
            className={txtInput}
          />
        </div>
        <div>
          <label htmlFor="loan-due-date" className={fieldLabel}>
            Due date (optional)
          </label>
          <DateInput
            id="loan-due-date"
            value={values.dueDate}
            onChange={(event) => setValues({ ...values, dueDate: event.target.value })}
            className={txtInput}
          />
        </div>
        <div>
          <label htmlFor="loan-note" className={fieldLabel}>
            Note (optional)
          </label>
          <input
            id="loan-note"
            type="text"
            value={values.note}
            onChange={(event) => setValues({ ...values, note: event.target.value })}
            className={txtInput}
          />
        </div>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={!whoIsReady(values)} onClick={() => go("amount")} className={`${btnPrimary} ${btnLg}`}>
          Next: amount →
        </button>
      </StepFooter>
    );
  } else if (step === "amount") {
    body = (
      <>
        <h2 className={screenTitle}>Which money did they send?</h2>
        <p className={screenHelp}>Only money marked as a loan that isn't linked to anything yet is listed.</p>
        {receivedOptions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ledger p-4 text-center text-sm text-grey-mid">
            No money is waiting to become a loan. Mark the money received as Loan in Transactions first.
          </p>
        ) : (
          <div role="group" aria-label="Money received" className="space-y-2.5">
            {receivedOptions.map((leg) => (
              <LegChoice
                key={leg._id}
                description={leg.description}
                detail={`${formatUkDate(leg.date)} · ${gbp(leg.amount)}`}
                on={leg._id === receivedId}
                onClick={() => setReceivedId(leg._id)}
              />
            ))}
          </div>
        )}
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={!received} onClick={() => go("repayments")} className={`${btnPrimary} ${btnLg}`}>
          Next: repayments →
        </button>
      </StepFooter>
    );
  } else if (step === "repayments") {
    body = (
      <>
        <h2 className={screenTitle}>Repayments so far</h2>
        <p className={screenHelp}>
          Optional. Tick any repayments already in Transactions. Repayments made later can be linked from Transactions with
          Link other side.
        </p>
        {repaymentOptions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ledger p-4 text-center text-sm text-grey-mid">
            No repayments are waiting to be linked.
          </p>
        ) : (
          <div role="group" aria-label="Repayments" className="space-y-2.5">
            {repaymentOptions.map((leg) => (
              <LegChoice
                key={leg._id}
                description={leg.description}
                detail={`${formatUkDate(leg.date)} · ${gbp(leg.amount)}`}
                on={repaymentIds.includes(leg._id)}
                onClick={() => toggleRepayment(leg._id)}
              />
            ))}
          </div>
        )}
        {problem !== null && (
          <p className="mt-4 rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error">{problem}</p>
        )}
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={saving || problem !== null} onClick={() => void record()} className={`${btnPrimary} ${btnLg}`}>
          Record loan
        </button>
      </StepFooter>
    );
  } else if (step === "done" && recorded) {
    body = (
      <div className="pt-4 text-center">
        <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
          <Check size={36} aria-hidden="true" />
        </div>
        <h2 className={`${screenTitle} text-center`}>{recorded.lender} loan recorded</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
          {gbp(recorded.summary.borrowed)} received · {recorded.repayments === 0
            ? "no repayments yet"
            : `${recorded.repayments} ${recorded.repayments === 1 ? "repayment" : "repayments"}, ${gbp(recorded.summary.repaid)}`}{" "}
          · {gbp(recorded.summary.outstanding)} still owed
        </p>

        <div className="mt-6 text-left">
          <span className={fieldLabel}>What's next</span>
          <button type="button" onClick={recordAnother} className={`${nextItem} mb-2`}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <Plus size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Record another loan</b>
              <span className="text-xs text-grey-mid">Start from the next money received.</span>
            </span>
          </button>
          <button type="button" onClick={onClose} className={nextItem}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <LayoutList size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Back to loans</b>
              <span className="text-xs text-grey-mid">See every loan and what is still owed.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>New loan</div>
      {LOAN_RAIL_ORDER.map((kind, position) => {
        const state: RailStepState = position < index ? "done" : position === index ? "now" : "todo";
        return (
          <RailStep
            key={kind}
            marker={String(position + 1)}
            label={LABELS[kind]}
            state={state}
            disabled={state === "todo"}
            onClick={() => go(kind)}
          />
        );
      })}
    </aside>
  );

  const summary = received && step !== "done" ? loanSummary(received, repayments) : null;
  const receipt = received && summary ? (
    <ReceiptCard>
      <p className={eyebrow}>This loan</p>
      <div className="mt-2">
        <ReceiptRow label="Lender" value={values.lender.trim() || "—"} />
        <ReceiptRow label="Received" value={gbp(received.amount)} />
        <ReceiptRow label="Repaid" value={gbp(summary.repaid)} />
        <ReceiptRow label="Still owed" value={gbp(summary.outstanding)} />
      </div>
    </ReceiptCard>
  ) : undefined;

  return (
    <WizardFrame
      ariaLabel="Record a loan"
      title={step === "done" ? "Loan recorded" : "Record a loan"}
      locked={saving}
      onClose={onClose}
      onBack={previous ? () => go(previous) : undefined}
      progress={{ total: LOAN_RAIL_ORDER.length, current: index }}
      rail={rail}
      receipt={receipt}
      notice={
        error ? (
          <p role="alert" className="mx-4 mb-2 rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error lg:mx-8">
            {error}
          </p>
        ) : undefined
      }
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}

function LegChoice({
  description,
  detail,
  on,
  onClick,
}: {
  description: string;
  detail: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-2xl border bg-white p-3.5 text-left transition-colors hover:bg-grey-light ${
        on ? "border-ink" : "border-ledger"
      }`}
    >
      <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
        {on && <Check size={14} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px] text-ink">{description}</b>
        <span className="block font-mono text-xs text-grey-mid">{detail}</span>
      </span>
    </button>
  );
}
