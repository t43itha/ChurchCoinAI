import { useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import DateInput from "../cashEntry/DateInput";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, fieldLabel, txtInput } from "../wizard/ui";

export type Loan = FunctionReturnType<typeof api.queries.movements.listLoans>[number];
export type UpdateLoanArgs = FunctionArgs<typeof api.mutations.movements.updateLoan>;

interface LoanSheetProps {
  loan: Loan;
  isSaving: boolean;
  onSave: (args: UpdateLoanArgs) => void;
  onClose: () => void;
}

// Edits who lent the money and when it is due. The amounts come from the linked transactions.
export default function LoanSheet({ loan, isSaving, onSave, onClose }: LoanSheetProps) {
  const [lender, setLender] = useState(loan.lender);
  const [dueDate, setDueDate] = useState(loan.dueDate ?? "");
  const [note, setNote] = useState(loan.note ?? "");
  const trimmedLender = lender.trim();

  return (
    <WizardFrame
      ariaLabel="Edit loan"
      title="Edit loan"
      onClose={onClose}
      locked={isSaving}
      footer={
        <StepFooter>
          <button
            type="button"
            disabled={trimmedLender === ""}
            onClick={() =>
              onSave({
                movementId: loan._id,
                lender: trimmedLender,
                dueDate: dueDate || undefined,
                note: note.trim() || undefined,
              })
            }
            className={`${btnPrimary} ${btnLg}`}
          >
            Save
          </button>
        </StepFooter>
      }
    >
      <div>
        <label htmlFor="edit-loan-lender" className={fieldLabel}>
          Lender
        </label>
        <input id="edit-loan-lender" type="text" value={lender} onChange={(event) => setLender(event.target.value)} className={txtInput} />
      </div>
      <div>
        <label htmlFor="edit-loan-due-date" className={fieldLabel}>
          Due date (optional)
        </label>
        <DateInput id="edit-loan-due-date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={txtInput} />
      </div>
      <div>
        <label htmlFor="edit-loan-note" className={fieldLabel}>
          Note (optional)
        </label>
        <input id="edit-loan-note" type="text" value={note} onChange={(event) => setNote(event.target.value)} className={txtInput} />
      </div>
    </WizardFrame>
  );
}
