import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { ArrowLeft, Check, Lock, Unlock, Plus, Trash2 } from "lucide-react";
import { computeDifferencePence, canCompleteSession } from "../lib/reconciliation";

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

interface Props {
  onBack: () => void;
}

// ─── Root ────────────────────────────────────────────────────────────────────

export const Reconciliation: React.FC<Props> = ({ onBack }) => {
  const [activeSessionId, setActiveSessionId] =
    useState<Id<"reconciliationSessions"> | null>(null);

  return activeSessionId ? (
    <SessionWorkspace
      sessionId={activeSessionId}
      onClose={() => setActiveSessionId(null)}
    />
  ) : (
    <SessionList onOpen={setActiveSessionId} onBack={onBack} />
  );
};

export default Reconciliation;

// ─── SessionList ─────────────────────────────────────────────────────────────

interface SessionListProps {
  onOpen: (id: Id<"reconciliationSessions">) => void;
  onBack: () => void;
}

const SessionList: React.FC<SessionListProps> = ({ onOpen, onBack }) => {
  const sessions = useQuery(api.queries.reconciliationSessions.list);
  const funds = useQuery(api.queries.funds.list);
  const createSession = useMutation(api.mutations.reconciliationSessions.create);
  const removeSession = useMutation(api.mutations.reconciliationSessions.remove);

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fundId: "" as Id<"funds"> | "",
    periodStart: "",
    periodEnd: "",
    openingBalance: "",
    closingBalance: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const newId = await createSession({
        fundId: formData.fundId as Id<"funds">,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        statementOpeningBalance: parseFloat(formData.openingBalance),
        statementClosingBalance: parseFloat(formData.closingBalance),
      });
      setShowForm(false);
      setFormData({ fundId: "", periodStart: "", periodEnd: "", openingBalance: "", closingBalance: "" });
      onOpen(newId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create reconciliation.");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: Id<"reconciliationSessions">) => {
    e.stopPropagation();
    try {
      await removeSession({ sessionId: id });
    } catch (err) {
      // silently surface in future; for now no-op
    }
  };

  const statusBadge = (status: string) => {
    if (status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 bg-sage-light text-sage-dark px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border border-sage/30">
          <Lock size={10} /> Completed
        </span>
      );
    }
    if (status === "reopened") {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border border-amber/30">
          <Unlock size={10} /> Reopened
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-paper text-charcoal px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border border-ledger">
        Draft
      </span>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-grey-mid hover:text-ink transition-colors"
        >
          <ArrowLeft size={14} /> Transactions
        </button>
      </div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Reconciliation</h1>
          <p className="text-sm text-grey-mid">
            Match your ledger against bank statements, period by period.
          </p>
        </div>
        <button
          className="btn-primary px-4 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus size={14} /> New reconciliation
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="swiss-card p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink mb-4">
            New Reconciliation
          </h2>
          {formError && (
            <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded p-2">
              {formError}
            </p>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fund */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-charcoal mb-1">
                Fund <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.fundId}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, fundId: e.target.value as Id<"funds"> }))
                }
                className="w-full border border-ledger rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-ink"
              >
                <option value="">Select a fund…</option>
                {(funds ?? []).map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Period */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-charcoal mb-1">
                Period Start <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.periodStart}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, periodStart: e.target.value }))
                }
                className="w-full border border-ledger rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-charcoal mb-1">
                Period End <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.periodEnd}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, periodEnd: e.target.value }))
                }
                className="w-full border border-ledger rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-ink"
              />
            </div>

            {/* Balances */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-charcoal mb-1">
                Opening Balance (£) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.openingBalance}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, openingBalance: e.target.value }))
                }
                placeholder="0.00"
                className="w-full border border-ledger rounded px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-charcoal mb-1">
                Closing Balance (£) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.closingBalance}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, closingBalance: e.target.value }))
                }
                placeholder="0.00"
                className="w-full border border-ledger rounded px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:border-ink"
              />
            </div>

            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary px-4 py-2 font-bold uppercase text-xs tracking-wide"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary px-4 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2"
              >
                <Check size={14} /> Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sessions table */}
      {sessions === undefined ? (
        <div className="text-sm text-grey-mid py-8 text-center">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="swiss-card p-10 flex flex-col items-center justify-center text-center">
          <p className="text-sm text-grey-mid">
            No reconciliations yet. Grab your latest bank statement and start one.
          </p>
        </div>
      ) : (
        <div className="swiss-card overflow-hidden">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-grey-mid">
                  Fund
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-grey-mid">
                  Period
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide text-grey-mid">
                  Closing Balance
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-grey-mid">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s._id}
                  className="cursor-pointer hover:bg-paper transition-colors border-t border-ledger"
                  onClick={() => onOpen(s._id)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-ink">
                    {s.fundName}
                  </td>
                  <td className="px-4 py-3 text-sm text-charcoal font-mono">
                    {s.periodStart} – {s.periodEnd}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-right">
                    {gbp(s.statementClosingBalance)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-right">
                    {s.status !== "completed" && (
                      <button
                        onClick={(e) => handleDelete(e, s._id)}
                        className="p-1.5 text-grey-mid hover:text-red-500 transition-colors rounded"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── SessionWorkspace ─────────────────────────────────────────────────────────

interface SessionWorkspaceProps {
  sessionId: Id<"reconciliationSessions">;
  onClose: () => void;
}

const SessionWorkspace: React.FC<SessionWorkspaceProps> = ({
  sessionId,
  onClose,
}) => {
  const workspace = useQuery(api.queries.reconciliationSessions.workspace, {
    sessionId,
  });
  const setCleared = useMutation(api.mutations.reconciliationSessions.setCleared);
  const completeSession = useMutation(api.mutations.reconciliationSessions.complete);
  const reopenSession = useMutation(api.mutations.reconciliationSessions.reopen);

  const [actionError, setActionError] = useState<string | null>(null);

  const differencePence = useMemo(() => {
    if (!workspace) return null;
    const { session, cleared } = workspace;
    return computeDifferencePence(
      session.statementOpeningBalance,
      session.statementClosingBalance,
      cleared
    );
  }, [workspace]);

  const isBalanced = differencePence === 0;

  if (workspace === undefined) {
    return (
      <div className="p-8 text-sm text-grey-mid text-center">Loading…</div>
    );
  }

  if (workspace === null) {
    return (
      <div className="p-8 text-sm text-red-500 text-center">
        Session not found or access denied.
        <button onClick={onClose} className="ml-2 underline">
          Back
        </button>
      </div>
    );
  }

  const { session, cleared, candidates } = workspace;
  const isCompleted = session.status === "completed";

  const clearedSum = cleared.reduce(
    (sum, t) => sum + (t.type === "Income" ? t.amount : -t.amount),
    0
  );

  const handleToggleCleared = async (
    transactionId: Id<"transactions">,
    checked: boolean
  ) => {
    try {
      await setCleared({ sessionId, transactionId, cleared: checked });
    } catch (err) {
      // Mutations errors surface via Convex reactivity; silently ignore for now
    }
  };

  const handleComplete = async () => {
    setActionError(null);
    try {
      await completeSession({ sessionId });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not complete session."
      );
    }
  };

  const handleReopen = async () => {
    const reason = window.prompt("Reason for reopening this reconciliation:");
    if (!reason || !reason.trim()) return;
    setActionError(null);
    try {
      await reopenSession({ sessionId, reason: reason.trim() });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not reopen session."
      );
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Back link */}
      <button
        onClick={onClose}
        className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-grey-mid hover:text-ink transition-colors mb-4"
      >
        <ArrowLeft size={14} /> All Reconciliations
      </button>

      <h1 className="text-xl font-bold text-ink mb-1">
        Reconciliation — {session.periodStart} to {session.periodEnd}
      </h1>

      {session.status === "reopened" && session.reopenedReason && (
        <p className="text-xs text-amber bg-amber-50 border border-amber/30 rounded px-3 py-2 mb-4">
          <span className="font-bold uppercase">Reopened: </span>
          {session.reopenedReason}
        </p>
      )}

      {/* Sticky balance strip */}
      <div className="swiss-card p-4 mb-6 sticky top-4 z-10">
        {actionError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">
            {actionError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 md:gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-grey-mid mb-0.5">
              Statement Opening
            </p>
            <p className="text-sm font-mono font-bold text-ink">
              {gbp(session.statementOpeningBalance)}
            </p>
          </div>

          <div className="text-grey-mid text-lg font-bold">+</div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-grey-mid mb-0.5">
              Cleared Items ({cleared.length})
            </p>
            <p className="text-sm font-mono font-bold text-ink">
              {clearedSum >= 0 ? "+" : ""}
              {gbp(clearedSum)}
            </p>
          </div>

          <div className="text-grey-mid text-lg font-bold">=</div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-grey-mid mb-0.5">
              Statement Closing
            </p>
            <p className="text-sm font-mono font-bold text-ink">
              {gbp(session.statementClosingBalance)}
            </p>
          </div>

          <div className="flex-1" />

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-grey-mid mb-0.5">
              Difference
            </p>
            <p
              className={`text-2xl font-mono font-bold ${
                isBalanced ? "text-sage" : "text-amber"
              }`}
            >
              {differencePence !== null ? gbp(differencePence / 100) : "—"}
            </p>
          </div>

          <div>
            {isCompleted ? (
              <button
                onClick={handleReopen}
                className="btn-secondary px-4 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2"
              >
                <Unlock size={14} /> Reopen
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={!isBalanced}
                className="btn-primary px-4 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={14} /> Complete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-column transaction grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Candidates */}
        <div className="swiss-card overflow-hidden">
          <div className="px-4 py-3 border-b border-ledger">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink">
              To match — on ledger, not yet on statement ({candidates.length})
            </h2>
          </div>
          {candidates.length === 0 ? (
            <p className="p-6 text-sm text-grey-mid text-center">
              All ledger transactions have been cleared for this period.
            </p>
          ) : (
            <ul className="divide-y divide-ledger">
              {candidates.map((t) => (
                <TransactionRow
                  key={t._id}
                  transaction={t}
                  checked={false}
                  disabled={isCompleted}
                  onChange={(checked) => handleToggleCleared(t._id, checked)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Cleared */}
        <div className="swiss-card overflow-hidden">
          <div className="px-4 py-3 border-b border-ledger">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink">
              Cleared — confirmed on this statement ({cleared.length})
            </h2>
          </div>
          {cleared.length === 0 ? (
            <p className="p-6 text-sm text-grey-mid text-center">
              Tick transactions on the left to mark them as cleared on your statement.
            </p>
          ) : (
            <ul className="divide-y divide-ledger">
              {cleared.map((t) => (
                <TransactionRow
                  key={t._id}
                  transaction={t}
                  checked={true}
                  disabled={isCompleted}
                  onChange={(checked) => handleToggleCleared(t._id, checked)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── TransactionRow ───────────────────────────────────────────────────────────

interface TxRowProps {
  transaction: {
    _id: Id<"transactions">;
    date: string;
    description: string;
    amount: number;
    type: "Income" | "Expenditure";
  };
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

const TransactionRow: React.FC<TxRowProps> = ({
  transaction: t,
  checked,
  disabled,
  onChange,
}) => {
  const signed = t.type === "Income" ? t.amount : -t.amount;
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-paper transition-colors">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-sage h-4 w-4 shrink-0 cursor-pointer disabled:cursor-default"
      />
      <span className="text-xs font-mono text-grey-mid shrink-0">{t.date}</span>
      <span className="flex-1 text-sm text-ink truncate">{t.description}</span>
      <span
        className={`text-sm font-mono font-bold shrink-0 ${
          t.type === "Income" ? "text-sage" : "text-ink"
        }`}
      >
        {signed >= 0 ? "+" : ""}
        {gbp(Math.abs(signed))}
      </span>
    </li>
  );
};
