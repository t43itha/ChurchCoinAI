import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { meetsMoneyTarget } from "../../convex/lib/money";
import type { MovementKind } from "../../lib/movementCategories";
import { linkCandidates, MOVEMENT_LABELS } from "../../lib/movementMatching";
import { notify } from "../../lib/notifications";
import { movementKindOf } from "../../lib/reportableTransactions";
import type { Fund, Transaction } from "../../types";
import TransactionDialog, { DialogFooter } from "./TransactionDialog";

type LinkArgs = FunctionArgs<typeof api.mutations.movements.link>;
type Loan = FunctionReturnType<typeof api.queries.movements.listLoans>[number];

const LABEL_CLASS = "block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1";
const INPUT_CLASS =
  "w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors";
const CHOICE_CLASS =
  "flex items-start gap-3 p-3 rounded-sm border border-ledger cursor-pointer hover:bg-paper transition-colors";

const money = (amount: number) => `£${amount.toFixed(2)}`;
const formatUkDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB");
const fundName = (funds: Fund[], fundId: string) =>
  funds.find((fund) => fund._id === fundId)?.name ?? "Unknown fund";

type LinkFormProps = {
  transaction: Transaction;
  transactions: Transaction[];
  funds: Fund[];
  loans: Loan[] | undefined;
  isSaving: boolean;
  onLink: (args: LinkArgs) => void;
  onClose: () => void;
};

function OtherSideForm({
  kind,
  transaction,
  transactions,
  funds,
  isSaving,
  onLink,
  onClose,
}: LinkFormProps & { kind: MovementKind }) {
  const transactionId = transaction._id as Id<"transactions">;
  const candidates = linkCandidates(transaction, transactions);
  const [chosenId, setChosenId] = useState(candidates[0]?._id ?? "");
  const chosen = candidates.find((candidate) => candidate._id === chosenId);

  return (
    <form
      className="p-5 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen) onLink({ transactionIds: [transactionId, chosen._id as Id<"transactions">] });
      }}
    >
      {candidates.length === 0 ? (
        <>
          <p className="text-sm text-grey-dark">
            {`No unlinked ${MOVEMENT_LABELS[kind]} of ${money(transaction.amount)} going the other way within 14 days.`}
          </p>
          <p className="text-xs text-grey-mid">Mark the other side with the same category first.</p>
        </>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className={LABEL_CLASS}>Choose the other side</legend>
          {candidates.map((candidate) => (
            <label key={candidate._id} className={CHOICE_CLASS}>
              <input
                type="radio"
                name="other-side"
                value={candidate._id}
                checked={candidate._id === chosenId}
                onChange={() => setChosenId(candidate._id)}
                className="mt-1 accent-[#a9743f]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink truncate">{candidate.description}</span>
                <span className="block text-xs text-grey-mid font-mono mt-0.5">
                  {`${formatUkDate(candidate.date)} · ${fundName(funds, candidate.fundId)} · ${money(candidate.amount)}`}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <DialogFooter submitLabel="Link" submitDisabled={!chosen} isSaving={isSaving} onClose={onClose} />
    </form>
  );
}

function LoanRadioList({
  name,
  loans,
  chosenId,
  onChoose,
}: {
  name: string;
  loans: Loan[];
  chosenId: string;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {loans.map((loan) => (
        <label key={loan._id} className={CHOICE_CLASS}>
          <input
            type="radio"
            name={name}
            value={loan._id}
            checked={loan._id === chosenId}
            onChange={() => onChoose(loan._id)}
            className="mt-1 accent-[#a9743f]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink truncate">{loan.lender}</span>
            <span className="block text-xs text-grey-mid font-mono mt-0.5">
              {`${money(loan.outstanding)} outstanding of ${money(loan.borrowed)}${loan.dueDate ? ` · due ${formatUkDate(loan.dueDate)}` : ""}`}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ReceivedLoanForm({ transaction, loans, isSaving, onLink, onClose }: LinkFormProps) {
  const transactionId = transaction._id as Id<"transactions">;
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [lender, setLender] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [chosenLoanId, setChosenLoanId] = useState("");
  const chosenLoan = loans?.find((loan) => loan._id === chosenLoanId);
  const canSubmit = mode === "new" ? lender.trim() !== "" : chosenLoan !== undefined;

  return (
    <form
      className="p-5 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "new") {
          onLink({
            transactionIds: [transactionId],
            lender: lender.trim(),
            dueDate: dueDate || undefined,
            note: note.trim() || undefined,
          });
        } else if (chosenLoan) {
          onLink({ transactionIds: [transactionId], movementId: chosenLoan._id });
        }
      }}
    >
      <p className="text-sm text-grey-dark">
        {`${money(transaction.amount)} received. Record it as a new loan, or add it to one already on the register.`}
      </p>
      <div className="flex gap-5">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" name="loan-mode" checked={mode === "new"} onChange={() => setMode("new")} className="accent-[#a9743f]" />
          New loan
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" name="loan-mode" checked={mode === "existing"} onChange={() => setMode("existing")} className="accent-[#a9743f]" />
          Add to an existing loan
        </label>
      </div>

      {mode === "new" ? (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="loan-lender" className={LABEL_CLASS}>Lender</label>
            <input id="loan-lender" type="text" required value={lender} onChange={(e) => setLender(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="loan-due-date" className={LABEL_CLASS}>Due date (optional)</label>
            <input id="loan-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${INPUT_CLASS} font-mono`} />
          </div>
          <div>
            <label htmlFor="loan-note" className={LABEL_CLASS}>Note (optional)</label>
            <input id="loan-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
      ) : loans === undefined ? (
        <p className="text-sm text-grey-mid">Loading loans…</p>
      ) : loans.length === 0 ? (
        <p className="text-sm text-grey-mid">No loans recorded yet. Use New loan instead.</p>
      ) : (
        <LoanRadioList name="existing-loan" loans={loans} chosenId={chosenLoanId} onChoose={setChosenLoanId} />
      )}

      <DialogFooter submitLabel="Link" submitDisabled={!canSubmit} isSaving={isSaving} onClose={onClose} />
    </form>
  );
}

function RepaymentForm({ transaction, loans, isSaving, onLink, onClose }: LinkFormProps) {
  const transactionId = transaction._id as Id<"transactions">;
  const [chosenLoanId, setChosenLoanId] = useState("");
  const openLoans = (loans ?? []).filter(
    (loan) => !loan.isRepaid && meetsMoneyTarget(loan.outstanding, transaction.amount)
  );
  const chosenLoan = openLoans.find((loan) => loan._id === chosenLoanId);

  return (
    <form
      className="p-5 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (chosenLoan) onLink({ transactionIds: [transactionId], movementId: chosenLoan._id });
      }}
    >
      {loans === undefined ? (
        <p className="text-sm text-grey-mid">Loading loans…</p>
      ) : openLoans.length === 0 ? (
        <p className="text-sm text-grey-dark">
          {`No open loan has ${money(transaction.amount)} outstanding. Record the money received as a loan first.`}
        </p>
      ) : (
        <>
          <p className="text-sm text-grey-dark">{`Choose the loan that ${money(transaction.amount)} repays.`}</p>
          <LoanRadioList name="repaid-loan" loans={openLoans} chosenId={chosenLoanId} onChoose={setChosenLoanId} />
        </>
      )}
      <DialogFooter submitLabel="Link" submitDisabled={!chosenLoan} isSaving={isSaving} onClose={onClose} />
    </form>
  );
}

export function LinkMovementPanel(props: LinkFormProps) {
  const { transaction } = props;
  const kind = movementKindOf(transaction);
  if (kind === "loan") {
    return transaction.type === "Income" ? <ReceivedLoanForm {...props} /> : <RepaymentForm {...props} />;
  }
  if (kind === undefined) return null;
  return <OtherSideForm {...props} kind={kind} />;
}

type LinkMovementModalProps = {
  transaction: Transaction;
  transactions: Transaction[];
  funds: Fund[];
  onClose: () => void;
};

export default function LinkMovementModal({ transaction, transactions, funds, onClose }: LinkMovementModalProps) {
  const link = useMutation(api.mutations.movements.link);
  const isLoan = movementKindOf(transaction) === "loan";
  const loans = useQuery(api.queries.movements.listLoans, isLoan ? {} : "skip");
  const [isSaving, setIsSaving] = useState(false);

  const handleLink = async (args: LinkArgs) => {
    setIsSaving(true);
    try {
      await link(args);
      notify("Linked", "Both sides are now linked.");
      onClose();
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to link this transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TransactionDialog title="Link other side" onClose={onClose}>
      <LinkMovementPanel
        transaction={transaction}
        transactions={transactions}
        funds={funds}
        loans={loans}
        isSaving={isSaving}
        onLink={handleLink}
        onClose={onClose}
      />
    </TransactionDialog>
  );
}
