import { useState } from "react";
import { Check } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import type { MovementKind } from "../../lib/movementCategories";
import { formatUkDate } from "../../lib/dateUtils";
import { linkCandidates, MOVEMENT_LABELS, openLoansFor } from "../../lib/movementMatching";
import type { Fund, Transaction } from "../../types";
import DateInput from "../cashEntry/DateInput";
import { shortDate } from "../cashEntry/format";
import { signedGbp } from "../statementImport/format";
import StepFooter from "../wizard/StepFooter";
import {
  btnLg,
  btnPrimary,
  darkCard,
  fieldLabel,
  screenHelp,
  screenTitle,
  Segmented,
  tickBox,
  tickRow,
  txtInput,
} from "../wizard/ui";
import { money, type LinkArgs, type LinkedWith, type Loan } from "./linkSteps";

export interface LinkFormProps {
  transaction: Transaction;
  transactions: Transaction[];
  funds: Fund[];
  loans: Loan[] | undefined;
  isSaving: boolean;
  // Sends the request and a description of what it links to, for the done step.
  onLink: (args: LinkArgs, linkedWith: LinkedWith) => void;
}

const fundName = (funds: Fund[], fundId: string) => funds.find((fund) => fund._id === fundId)?.name ?? "Unknown fund";

// The transaction being linked, kept in view while its other side is chosen.
export function LinkSummary({ transaction, funds }: { transaction: Transaction; funds: Fund[] }) {
  const signed = transaction.type === "Income" ? transaction.amount : -transaction.amount;
  return (
    <div className={`${darkCard} mb-4`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">Waiting for the other side</div>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block truncate text-[16px]">{transaction.description}</b>
          <span className="text-[12.5px] text-white/65">
            {`${shortDate(transaction.date)} · ${fundName(funds, transaction.fundId)}`}
          </span>
        </div>
        <span className="whitespace-nowrap font-mono text-base font-bold">{signedGbp(signed)}</span>
      </div>
    </div>
  );
}

// Sticks to the bottom of the scrolling body, so the way forward stays in reach on a phone.
function MatchFooter({ disabled, onLink }: { disabled: boolean; onLink: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-5 lg:-mx-8">
      <StepFooter>
        <button type="button" disabled={disabled} onClick={onLink} className={`${btnPrimary} ${btnLg}`}>
          Link
        </button>
      </StepFooter>
    </div>
  );
}

// Candidates and loans are single-select tick rows. The amount sits on the right when there is one.
function TickRow({
  on,
  title,
  detail,
  amount,
  onChoose,
}: {
  on: boolean;
  title: string;
  detail: string;
  amount?: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onChoose}
      className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
    >
      <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
        {on && <Check size={14} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px] font-semibold">{title}</b>
        <span className="block truncate text-[12.5px] text-grey-mid">{detail}</span>
      </span>
      {amount !== undefined && (
        <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink">{amount}</span>
      )}
    </button>
  );
}

function LoanRows({ loans, chosenId, onChoose }: { loans: Loan[]; chosenId: string; onChoose: (id: string) => void }) {
  return (
    <div className="space-y-2.5">
      {loans.map((loan) => (
        <TickRow
          key={loan._id}
          on={loan._id === chosenId}
          title={loan.lender}
          detail={`of ${money(loan.borrowed)} borrowed${loan.dueDate ? ` · due ${formatUkDate(loan.dueDate)}` : ""}`}
          amount={money(loan.outstanding)}
          onChoose={() => onChoose(loan._id)}
        />
      ))}
    </div>
  );
}

// A transfer or returned payment: the other side is one of the candidates.
export function OtherSideStep({
  kind,
  transaction,
  transactions,
  funds,
  isSaving,
  onLink,
}: LinkFormProps & { kind: MovementKind }) {
  const transactionId = transaction._id as Id<"transactions">;
  const candidates = linkCandidates(transaction, transactions);
  const [chosenId, setChosenId] = useState(candidates[0]?._id ?? "");
  const chosen = candidates.find((candidate) => candidate._id === chosenId);

  return (
    <div>
      <h2 className={screenTitle}>Which is the other side?</h2>
      <p className={screenHelp}>{`The ${MOVEMENT_LABELS[kind]} goes the other way, for the same amount.`}</p>

      {candidates.length === 0 ? (
        <>
          <p className="text-sm text-grey-dark">
            {`No unlinked ${MOVEMENT_LABELS[kind]} of ${money(transaction.amount)} going the other way within 14 days.`}
          </p>
          <p className="mt-1 text-xs text-grey-mid">Mark the other side with the same category first.</p>
        </>
      ) : (
        <div className="space-y-2.5">
          {candidates.map((candidate) => (
            <TickRow
              key={candidate._id}
              on={candidate._id === chosenId}
              title={candidate.description}
              detail={`${formatUkDate(candidate.date)} · ${fundName(funds, candidate.fundId)}`}
              amount={money(candidate.amount)}
              onChoose={() => setChosenId(candidate._id)}
            />
          ))}
        </div>
      )}

      <MatchFooter
        disabled={!chosen || isSaving}
        onLink={() => {
          if (!chosen) return;
          onLink(
            { transactionIds: [transactionId, chosen._id as Id<"transactions">] },
            { kind: "transaction", description: chosen.description, amount: chosen.amount }
          );
        }}
      />
    </div>
  );
}

const LOAN_MODES = ["New loan", "Existing loan"] as const;
type LoanMode = (typeof LOAN_MODES)[number];

// Money received: record it as a new loan, or add it to a loan already on the register.
export function ReceivedLoanStep({ transaction, loans, isSaving, onLink }: LinkFormProps) {
  const transactionId = transaction._id as Id<"transactions">;
  const [mode, setMode] = useState<LoanMode>("New loan");
  const [lender, setLender] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [chosenLoanId, setChosenLoanId] = useState("");
  const chosenLoan = loans?.find((loan) => loan._id === chosenLoanId);
  const canSubmit = mode === "New loan" ? lender.trim() !== "" : chosenLoan !== undefined;

  return (
    <div>
      <h2 className={screenTitle}>New loan, or an existing one?</h2>
      <p className={screenHelp}>{`${money(transaction.amount)} received. Record it as a new loan, or add it to one already on the register.`}</p>
      <Segmented label="Loan" options={LOAN_MODES} value={mode} onChange={setMode} />

      <div className="mt-1">
        {mode === "New loan" ? (
          <>
            <label htmlFor="loan-lender" className={fieldLabel}>
              Lender
            </label>
            <input id="loan-lender" type="text" value={lender} onChange={(e) => setLender(e.target.value)} className={txtInput} />

            <span className={fieldLabel}>Due date (optional)</span>
            <DateInput
              aria-label="Due date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${txtInput} min-w-0`}
            />

            <label htmlFor="loan-note" className={fieldLabel}>
              Note (optional)
            </label>
            <input id="loan-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={txtInput} />
          </>
        ) : loans === undefined ? (
          <p className="mt-4 text-sm text-grey-mid">Loading loans…</p>
        ) : loans.length === 0 ? (
          <p className="mt-4 text-sm text-grey-mid">No loans recorded yet. Use New loan instead.</p>
        ) : (
          <div className="mt-4">
            <LoanRows loans={loans} chosenId={chosenLoanId} onChoose={setChosenLoanId} />
          </div>
        )}
      </div>

      <MatchFooter
        disabled={!canSubmit || isSaving}
        onLink={() => {
          if (mode === "New loan") {
            onLink(
              {
                transactionIds: [transactionId],
                lender: lender.trim(),
                dueDate: dueDate || undefined,
                note: note.trim() || undefined,
              },
              { kind: "new-loan", lender: lender.trim() }
            );
          } else if (chosenLoan) {
            onLink(
              { transactionIds: [transactionId], movementId: chosenLoan._id },
              { kind: "loan", lender: chosenLoan.lender, received: true }
            );
          }
        }}
      />
    </div>
  );
}

// Money going out: pick the open loan it repays.
export function RepaymentStep({ transaction, loans, isSaving, onLink }: LinkFormProps) {
  const transactionId = transaction._id as Id<"transactions">;
  const [chosenLoanId, setChosenLoanId] = useState("");
  const openLoans = openLoansFor(loans ?? [], transaction.amount);
  const chosenLoan = openLoans.find((loan) => loan._id === chosenLoanId);

  return (
    <div>
      <h2 className={screenTitle}>Which loan does this repay?</h2>
      {loans === undefined ? (
        <p className="mt-4 text-sm text-grey-mid">Loading loans…</p>
      ) : openLoans.length === 0 ? (
        <p className="mt-4 text-sm text-grey-dark">
          {`No open loan has ${money(transaction.amount)} outstanding. Record the money received as a loan first.`}
        </p>
      ) : (
        <>
          <p className={screenHelp}>{`Choose the loan that ${money(transaction.amount)} repays.`}</p>
          <LoanRows loans={openLoans} chosenId={chosenLoanId} onChoose={setChosenLoanId} />
        </>
      )}

      <MatchFooter
        disabled={!chosenLoan || isSaving}
        onLink={() => {
          if (!chosenLoan) return;
          onLink(
            { transactionIds: [transactionId], movementId: chosenLoan._id },
            { kind: "loan", lender: chosenLoan.lender, received: false }
          );
        }}
      />
    </div>
  );
}
