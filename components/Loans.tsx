import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { sumMoney } from "../convex/lib/money";
import { formatLocalDateInputValue, formatUkDate } from "../lib/dateUtils";
import { notify } from "../lib/notifications";
import { can } from "../lib/permissions";
import { isVoidedTransaction } from "../lib/reportableTransactions";
import type { AppUser } from "../types";
import LoadingSpinner from "./LoadingSpinner";
import { gbp } from "./cashEntry/format";
import HeroCard from "./hub/HeroCard";
import HubHeader from "./hub/HubHeader";
import HubLayout from "./hub/HubLayout";
import { lastRepaymentDate, loanStatus, type LoanStatus } from "./loans/loanFacts";
import LoanSheet, { type Loan, type UpdateLoanArgs } from "./loans/LoanSheet";
import RecordLoanWizard from "./loans/RecordLoanWizard";
import { btnMd, btnPrimary, linkBtn, linkBtnSm, tagAmber, tagBase, tagSage } from "./wizard/ui";

type LoanLeg = Loan["legs"][number];

const STATUS_TAG: Record<LoanStatus, string> = {
  Repaid: tagSage,
  Overdue: `${tagBase} bg-error-light text-error`,
  Open: tagAmber,
};

export default function Loans({ currentUser }: { currentUser: AppUser }) {
  const canEdit = can(currentUser.role, "ledger.write");
  const loans = useQuery(api.queries.movements.listLoans, {});
  const unlink = useMutation(api.mutations.movements.unlink);
  const updateLoan = useMutation(api.mutations.movements.updateLoan);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (loans === undefined) return <LoadingSpinner message="Loading loans..." />;

  const today = formatLocalDateInputValue(new Date());
  const editingLoan = loans.find((loan) => loan._id === editingId);
  const openCount = loans.filter((loan) => !loan.isRepaid).length;

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
    <div className="animate-enter pb-12">
      <HubLayout>
        <HubHeader
          title="Loans"
          status={`${openCount} open · ${gbp(totals.outstanding)} still owed`}
          actions={
            canEdit ? (
              <button type="button" onClick={() => setRecording(true)} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
                + Record a loan
              </button>
            ) : null
          }
        />

        <HeroCard
          label="Owed by the church"
          value={gbp(totals.outstanding)}
          sub={`${gbp(totals.borrowed)} borrowed · ${gbp(totals.repaid)} repaid`}
        />

        {loans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ledger p-8 text-center">
            <p className="text-sm font-semibold text-ink">No loans recorded yet.</p>
            <p className="mt-1 text-sm text-grey-mid">
              Mark the money received as Loan in Transactions, then choose Link other side.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {loans.map((loan) => {
              const isOpen = expanded.has(loan._id);
              const status = loanStatus(loan, today);
              const lastRepayment = lastRepaymentDate(loan.legs);
              const repaidPercent = loan.borrowed > 0 ? Math.min((loan.repaid / loan.borrowed) * 100, 100) : 0;
              const detail = [
                `${gbp(loan.repaid)} repaid of ${gbp(loan.borrowed)}`,
                lastRepayment ? `last repaid ${formatUkDate(lastRepayment)}` : "no repayments yet",
              ].join(" · ");
              return (
                <li key={loan._id}>
                  <div className="flex items-center gap-2 px-4 pt-3.5">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`loan-legs-${loan._id}`}
                      onClick={() => toggle(loan._id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[14.5px] text-ink">{loan.lender}</b>
                        <span className="block text-xs text-grey-mid">{detail}</span>
                        {loan.dueDate && <span className="block text-xs text-grey-mid">due {formatUkDate(loan.dueDate)}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block whitespace-nowrap font-mono text-sm font-semibold text-ink">
                          {gbp(loan.outstanding)}
                        </span>
                        <span className={`${STATUS_TAG[status]} mt-1`}>{status}</span>
                      </span>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`shrink-0 text-grey-mid transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {canEdit && (
                      <button type="button" aria-label="Edit loan" onClick={() => setEditingId(loan._id)} className={linkBtn}>
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="px-4 pb-3.5 pt-2.5">
                    <div className="h-[7px] overflow-hidden rounded-full bg-[#eceae5]" aria-hidden="true">
                      <div className="h-full rounded-full bg-sage" style={{ width: `${repaidPercent}%` }} />
                    </div>
                  </div>
                  {isOpen && (
                    <div id={`loan-legs-${loan._id}`} className="border-t border-ledger bg-paper px-4">
                      {loan.note && (
                        <p className="pt-3 text-sm text-ink">
                          <span className="block text-xs font-semibold text-grey-mid">Note</span>
                          {loan.note}
                        </p>
                      )}
                      <ul className="divide-y divide-ledger">
                        {loan.legs.map((leg) => (
                          <LoanLegRow
                            key={leg._id}
                            leg={leg}
                            canEdit={canEdit}
                            onUnlink={() => handleUnlink(leg._id as Id<"transactions">)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </HubLayout>

      {editingLoan && (
        <LoanSheet
          key={editingLoan._id}
          loan={editingLoan}
          isSaving={isSaving}
          onSave={handleSave}
          onClose={() => setEditingId(null)}
        />
      )}

      {recording && canEdit && <RecordLoanWizard onClose={() => setRecording(false)} />}
    </div>
  );
}

function LoanLegRow({ leg, canEdit, onUnlink }: { leg: LoanLeg; canEdit: boolean; onUnlink: () => void }) {
  const voided = isVoidedTransaction(leg);
  const textClass = voided ? "text-grey-mid line-through" : "text-ink";
  // Phones stack the leg in two lines (date and direction, then description, amount and Unlink).
  // From sm up the wrappers disappear and the row reads date, description, direction, amount, Unlink as before.
  return (
    <li className="py-2.5 text-sm sm:flex sm:items-center sm:gap-3">
      <div className="flex items-center gap-2 sm:contents">
        <span className={`font-mono text-xs sm:w-24 sm:shrink-0 sm:text-sm ${textClass}`}>{formatUkDate(leg.date)}</span>
        <span className="shrink-0 text-xs font-semibold text-grey-mid sm:order-1">
          {leg.type === "Income" ? "Received" : "Repaid"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3 sm:contents">
        <span className={`min-w-0 flex-1 truncate ${textClass}`}>{leg.description}</span>
        <span className={`w-24 shrink-0 text-right font-mono sm:order-2 ${textClass}`}>{gbp(leg.amount)}</span>
        {canEdit && !voided && (
          <button type="button" aria-label="Remove from loan" onClick={onUnlink} className={`${linkBtnSm} sm:order-2`}>
            Unlink
          </button>
        )}
      </div>
    </li>
  );
}
