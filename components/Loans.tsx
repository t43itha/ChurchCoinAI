import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ChevronDown } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { sumMoney } from "../convex/lib/money";
import { isLoanOverdue } from "../lib/movementMatching";
import { formatLocalDateInputValue, formatUkDate } from "../lib/dateUtils";
import { notify } from "../lib/notifications";
import { can } from "../lib/permissions";
import { isVoidedTransaction } from "../lib/reportableTransactions";
import type { AppUser } from "../types";
import LoadingSpinner from "./LoadingSpinner";
import TransactionDialog, {
  DialogFooter,
  FORM_INPUT_CLASS,
  FORM_LABEL_CLASS,
} from "./transactions/TransactionDialog";

type Loan = FunctionReturnType<typeof api.queries.movements.listLoans>[number];
type LoanLeg = Loan["legs"][number];
type UpdateLoanArgs = FunctionArgs<typeof api.mutations.movements.updateLoan>;

const poundsFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const formatPounds = (amount: number) => poundsFormatter.format(amount);

type LoanStatus = "Repaid" | "Overdue" | "Open";
const STATUS_CLASS: Record<LoanStatus, string> = {
  Repaid: "badge-success",
  Overdue: "badge-error",
  Open: "badge-warning",
};
const BADGE_BASE = "inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]";

const loanStatus = (loan: Loan, today: string): LoanStatus => {
  if (loan.isRepaid) return "Repaid";
  return isLoanOverdue(loan, today) ? "Overdue" : "Open";
};

type EditLoanPanelProps = {
  loan: Loan;
  isSaving: boolean;
  onSave: (args: UpdateLoanArgs) => void;
  onClose: () => void;
};

export function EditLoanPanel({ loan, isSaving, onSave, onClose }: EditLoanPanelProps) {
  const [lender, setLender] = useState(loan.lender);
  const [dueDate, setDueDate] = useState(loan.dueDate ?? "");
  const [note, setNote] = useState(loan.note ?? "");
  const trimmedLender = lender.trim();

  return (
    <form
      className="p-5 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmedLender === "") return;
        onSave({
          movementId: loan._id,
          lender: trimmedLender,
          dueDate: dueDate || undefined,
          note: note.trim() || undefined,
        });
      }}
    >
      <div>
        <label htmlFor="edit-loan-lender" className={FORM_LABEL_CLASS}>Lender</label>
        <input id="edit-loan-lender" type="text" required value={lender} onChange={(e) => setLender(e.target.value)} className={FORM_INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="edit-loan-due-date" className={FORM_LABEL_CLASS}>Due date (optional)</label>
        <input id="edit-loan-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${FORM_INPUT_CLASS} font-mono`} />
      </div>
      <div>
        <label htmlFor="edit-loan-note" className={FORM_LABEL_CLASS}>Note (optional)</label>
        <input id="edit-loan-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={FORM_INPUT_CLASS} />
      </div>
      <DialogFooter submitLabel="Save" submitDisabled={trimmedLender === ""} isSaving={isSaving} onClose={onClose} />
    </form>
  );
}

export default function Loans({ currentUser }: { currentUser: AppUser }) {
  const canEdit = can(currentUser.role, "ledger.write");
  const loans = useQuery(api.queries.movements.listLoans, {});
  const unlink = useMutation(api.mutations.movements.unlink);
  const updateLoan = useMutation(api.mutations.movements.updateLoan);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (loans === undefined) return <LoadingSpinner message="Loading loans..." />;

  const today = formatLocalDateInputValue(new Date());
  const editingLoan = loans.find((loan) => loan._id === editingId);
  const columnCount = canEdit ? 7 : 6;

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleUnlink = async (transactionId: Id<"transactions">) => {
    try {
      await unlink({ transactionId });
      notify("Removed", "The transaction is no longer linked to this loan.");
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to remove this transaction from the loan.");
    }
  };

  const handleSave = async (args: UpdateLoanArgs) => {
    setIsSaving(true);
    try {
      await updateLoan(args);
      notify("Loan updated", "The loan details are saved.");
      setEditingId(null);
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to update this loan.");
    } finally {
      setIsSaving(false);
    }
  };

  const totals = {
    borrowed: sumMoney(loans, (loan) => loan.borrowed),
    repaid: sumMoney(loans, (loan) => loan.repaid),
    outstanding: sumMoney(loans, (loan) => loan.outstanding),
  };

  return (
    <div className="ledger-space-y-[22px] animate-enter max-w-7xl mx-auto pb-20">
      <header className="swiss-card-static p-6 md:p-[26px]">
        <h2 className="text-[32px] leading-tight font-bold text-ink tracking-tight">Loans</h2>
        <p className="text-grey-mid mt-2 text-[15px] font-medium">
          Money the church has borrowed, what it has repaid, and what it still owes.
        </p>
      </header>

      {loans.length === 0 ? (
        <div className="swiss-card-static p-8 text-center">
          <p className="text-sm font-semibold text-ink">No loans recorded yet.</p>
          <p className="text-sm text-grey-mid mt-1">
            Mark the money received as Loan in Transactions, then choose Link other side.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left ledger-table">
            <thead>
              <tr>
                <th className="p-4">Lender</th>
                <th className="p-4 text-right">Borrowed</th>
                <th className="p-4 text-right">Repaid</th>
                <th className="p-4 text-right">Outstanding</th>
                <th className="p-4">Due</th>
                <th className="p-4">Status</th>
                {canEdit && <th className="p-4"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            {loans.map((loan) => {
              const isOpen = expanded.has(loan._id);
              const status = loanStatus(loan, today);
              return (
                <tbody key={loan._id}>
                  <tr>
                    <td className="p-4">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`loan-legs-${loan._id}`}
                        onClick={() => toggle(loan._id)}
                        className="flex items-center gap-2 text-left font-semibold text-ink"
                      >
                        <ChevronDown size={15} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        {loan.lender}
                      </button>
                      {loan.note && <p className="text-xs text-grey-mid mt-0.5 ml-[23px]">{loan.note}</p>}
                    </td>
                    <td className="p-4 text-right font-mono">{formatPounds(loan.borrowed)}</td>
                    <td className="p-4 text-right font-mono">{formatPounds(loan.repaid)}</td>
                    <td className="p-4 text-right font-mono font-semibold">{formatPounds(loan.outstanding)}</td>
                    <td className="p-4 font-mono text-sm">{loan.dueDate ? formatUkDate(loan.dueDate) : "None"}</td>
                    <td className="p-4">
                      <span className={`${BADGE_BASE} ${STATUS_CLASS[status]}`}>{status}</span>
                    </td>
                    {canEdit && (
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          aria-label="Edit loan"
                          onClick={() => setEditingId(loan._id)}
                          className="text-xs font-bold uppercase tracking-wide text-grey-dark hover:text-ink"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr id={`loan-legs-${loan._id}`}>
                      <td colSpan={columnCount} className="p-4 bg-paper">
                        <ul className="flex flex-col divide-y divide-[#efeee9]">
                          {loan.legs.map((leg) => (
                            <LoanLegRow
                              key={leg._id}
                              leg={leg}
                              canEdit={canEdit}
                              onUnlink={() => handleUnlink(leg._id as Id<"transactions">)}
                            />
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="font-semibold text-ink">
                <td className="p-4">Total</td>
                <td className="p-4 text-right font-mono">{formatPounds(totals.borrowed)}</td>
                <td className="p-4 text-right font-mono">{formatPounds(totals.repaid)}</td>
                <td className="p-4 text-right font-mono">{formatPounds(totals.outstanding)}</td>
                <td className="p-4" />
                <td className="p-4" />
                {canEdit && <td className="p-4" />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editingLoan && (
        <TransactionDialog title="Edit loan" onClose={() => setEditingId(null)}>
          <EditLoanPanel
            key={editingLoan._id}
            loan={editingLoan}
            isSaving={isSaving}
            onSave={handleSave}
            onClose={() => setEditingId(null)}
          />
        </TransactionDialog>
      )}
    </div>
  );
}

function LoanLegRow({ leg, canEdit, onUnlink }: { leg: LoanLeg; canEdit: boolean; onUnlink: () => void }) {
  const voided = isVoidedTransaction(leg);
  const textClass = voided ? "text-grey-mid line-through" : "text-ink";
  return (
    <li className="flex items-center gap-4 py-2.5 text-sm">
      <span className={`w-24 shrink-0 font-mono ${textClass}`}>{formatUkDate(leg.date)}</span>
      <span className={`min-w-0 flex-1 truncate ${textClass}`}>{leg.description}</span>
      <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-grey-mid">
        {leg.type === "Income" ? "Received" : "Repaid"}
      </span>
      <span className={`w-28 shrink-0 text-right font-mono ${textClass}`}>{formatPounds(leg.amount)}</span>
      {canEdit && !voided && (
        <button
          type="button"
          aria-label="Remove from loan"
          onClick={onUnlink}
          className="shrink-0 text-xs font-bold uppercase tracking-wide text-grey-dark hover:text-ink"
        >
          Unlink
        </button>
      )}
    </li>
  );
}
