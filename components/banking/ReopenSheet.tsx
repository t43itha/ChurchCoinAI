import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { RotateCcw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { notify } from "../../lib/notifications";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import { gbp } from "../cashEntry/format";
import { fullDate } from "../statementImport/format";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, card, fieldLabel, screenHelp, screenTitle, txtArea } from "../wizard/ui";
import { hasEnoughNote } from "./draft";

type BankingRecord = Doc<"cashBankingReconciliations">;

interface ReopenSheetProps {
  reconciliation: BankingRecord;
  onCancel: () => void;
  // Called once the server has reopened the banking, with the record as it now stands.
  onReopened: (reopened: BankingRecord) => void;
}

// Asks why a completed banking is being reopened before it is unlocked for correction.
export default function ReopenSheet({ reconciliation, onCancel, onReopened }: ReopenSheetProps) {
  const reopen = useMutation(api.mutations.cashBankingReconciliations.reopen);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!hasEnoughNote(trimmed) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reopen({ reconciliationId: reconciliation._id, reason: trimmed });
      notify("Banking Reopened", "Review and complete the correction.");
      onReopened({ ...reconciliation, status: "reopened", reopenReason: trimmed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reopen the banking.";
      setError(message);
      notify("Error", message);
    } finally {
      setBusy(false);
    }
  };

  const completedOn = reconciliation.completedAt
    ? fullDate(formatLocalDateInputValue(new Date(reconciliation.completedAt)))
    : null;

  return (
    <WizardFrame
      ariaLabel="Reopen banking"
      title="Reopen banking"
      locked={busy}
      onClose={onCancel}
      notice={
        error ? (
          <p role="alert" className="mx-4 mb-2 rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error lg:mx-8">
            {error}
          </p>
        ) : undefined
      }
      footer={
        <StepFooter>
          <button
            type="button"
            disabled={!hasEnoughNote(reason) || busy}
            onClick={() => void submit()}
            className={`${btnPrimary} ${btnLg}`}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reopen banking
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Reopen this banking?</h2>
      <p className={screenHelp}>
        It goes back to the walkthrough so the deposit can be corrected. The deposits stay out of the history until it is
        completed again.
      </p>

      <div className={card}>
        <div className="font-mono text-base font-semibold text-ink">{gbp(reconciliation.bankedTotal)} banked</div>
        {completedOn && <div className="mt-0.5 text-xs text-grey-mid">Completed {completedOn}</div>}
      </div>

      <label htmlFor="banking-reopen-reason" className={fieldLabel}>
        Why reopen it?
      </label>
      <textarea
        id="banking-reopen-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. A cheque went in on the wrong deposit"
        className={txtArea}
        disabled={busy}
      />
      <p className="mt-1.5 text-xs text-grey-mid">At least 3 characters. The reason is kept on the record.</p>
    </WizardFrame>
  );
}
