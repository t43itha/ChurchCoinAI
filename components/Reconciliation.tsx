import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { gbp } from "./cashEntry/format";
import ReconcileWizard from "./reconcile/ReconcileWizard";
import { periodLabel } from "./reconcile/format";
import { btnMd, btnPrimary, linkBtn, tagAmber, tagGrey, tagSage } from "./wizard/ui";

interface Props {
  onBack: () => void;
}

const STATUS_TAG = {
  draft: { label: "Draft", className: tagGrey },
  reopened: { label: "Reopened", className: tagAmber },
  completed: { label: "Completed", className: tagSage },
} as const;

export const Reconciliation = ({ onBack }: Props) => {
  const sessions = useQuery(api.queries.reconciliationSessions.list);
  const funds = useQuery(api.queries.funds.list);
  const removeSession = useMutation(api.mutations.reconciliationSessions.remove);

  // Open walkthrough: no sessionId starts a new reconciliation.
  const [wizard, setWizard] = useState<{ sessionId?: Id<"reconciliationSessions"> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (sessionId: Id<"reconciliationSessions">) => {
    if (!window.confirm("Delete this reconciliation? Ticked lines will be unticked.")) return;
    setError(null);
    try {
      await removeSession({ sessionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the reconciliation.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8">
      <button type="button" onClick={onBack} className={`${linkBtn} gap-1`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Transactions
      </button>

      <h1 className="mt-3 text-[26px] font-bold tracking-tight text-ink">Reconciliation</h1>
      <p className="mt-1 text-sm text-grey-mid">Check each bank statement against the ledger, one month at a time.</p>

      <button
        type="button"
        onClick={() => setWizard({})}
        className={`${btnPrimary} ${btnMd} mt-5 !w-auto px-5`}
      >
        Reconcile a month
      </button>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error">{error}</p>}

      <div className="mt-6">
        {sessions === undefined ? (
          <p className="py-8 text-center text-sm text-grey-mid">Loading reconciliations…</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ledger p-10 text-center text-sm text-grey-mid">
            No reconciliations yet. Grab your latest bank statement and start one.
          </div>
        ) : (
          <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {sessions.map((session) => {
              const status = STATUS_TAG[session.status];
              return (
                <li key={session._id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setWizard({ sessionId: session._id })}
                    className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-grey-light"
                  >
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] text-ink">{session.fundName}</b>
                      <span className="text-[12.5px] text-grey-mid">
                        {periodLabel(session.periodStart, session.periodEnd)}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-mono text-sm text-ink">
                      {gbp(session.statementClosingBalance)}
                    </span>
                    <span className={status.className}>{status.label}</span>
                  </button>
                  {session.status !== "completed" && (
                    <button
                      type="button"
                      aria-label="Delete reconciliation"
                      onClick={() => void handleDelete(session._id)}
                      className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-mid hover:text-error"
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {wizard && (
        <ReconcileWizard
          funds={funds ?? []}
          sessionId={wizard.sessionId}
          onClose={() => setWizard(null)}
        />
      )}
    </div>
  );
};

export default Reconciliation;
