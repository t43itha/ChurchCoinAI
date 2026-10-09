import { Loader2, X } from "lucide-react";
import type { Transaction } from "../../types";
import { formatUkDate } from "../../lib/dateUtils";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnPrimary, card, fieldLabel, screenHelp, screenTitle, txtArea } from "../wizard/ui";
import { formatSignedAmount } from "./transactionView";

interface TransactionVoidSheetProps {
  transaction: Transaction;
  reason: string;
  busy: boolean;
  onReason: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

// Voiding asks for a reason, which is stored with the row.
export default function TransactionVoidSheet({ transaction, reason, busy, onReason, onConfirm, onClose }: TransactionVoidSheetProps) {
  return (
    <WizardFrame
      ariaLabel="Void transaction"
      title="Void transaction"
      onClose={onClose}
      locked={busy}
      footer={
        <StepFooter>
          <button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy} className={`${btnPrimary} h-[54px] text-base`}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
            Void transaction
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Void this transaction?</h2>
      <p className={screenHelp}>
        It is left out of reports, totals, pledge progress and AI summaries. You can restore it later.
      </p>
      <div className={card}>
        <p className="text-sm font-semibold text-ink">
          {formatUkDate(transaction.date)} · {transaction.description}
        </p>
        <p className="mt-1 font-mono text-sm font-semibold text-ink">{formatSignedAmount(transaction)}</p>
      </div>
      <label htmlFor="void-reason" className={fieldLabel}>
        Reason
      </label>
      <textarea
        id="void-reason"
        value={reason}
        onChange={(event) => onReason(event.target.value)}
        rows={3}
        className={txtArea}
        placeholder="e.g. Duplicate bank import"
      />
    </WizardFrame>
  );
}
