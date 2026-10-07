import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import { notify } from "../../lib/notifications";
import type { Fund } from "../../types";
import TransactionDialog, { DialogFooter } from "./TransactionDialog";

type TransferArgs = FunctionArgs<typeof api.mutations.movements.createJournalTransfer>;

const LABEL_CLASS = "block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1";
const INPUT_CLASS =
  "w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors";

type JournalTransferPanelProps = {
  funds: Fund[];
  isSaving: boolean;
  onSubmit: (args: TransferArgs) => void;
  onClose: () => void;
};

export function JournalTransferPanel({ funds, isSaving, onSubmit, onClose }: JournalTransferPanelProps) {
  const [fromFundId, setFromFundId] = useState("");
  const [toFundId, setToFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => formatLocalDateInputValue(new Date()));
  const [note, setNote] = useState("");

  const parsedAmount = Number(amount);
  const canSubmit = fromFundId !== "" && toFundId !== "" && fromFundId !== toFundId && parsedAmount > 0;

  return (
    <form
      className="p-5 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          fromFundId: fromFundId as Id<"funds">,
          toFundId: toFundId as Id<"funds">,
          amount: parsedAmount,
          date,
          note: note.trim() || undefined,
        });
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="transfer-from" className={LABEL_CLASS}>From fund</label>
          <select id="transfer-from" required value={fromFundId} onChange={(e) => setFromFundId(e.target.value)} className={INPUT_CLASS}>
            <option value="">Choose a fund…</option>
            {funds.map((fund) => (
              <option key={fund._id} value={fund._id}>{fund.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="transfer-to" className={LABEL_CLASS}>To fund</label>
          <select id="transfer-to" required value={toFundId} onChange={(e) => setToFundId(e.target.value)} className={INPUT_CLASS}>
            <option value="">Choose a fund…</option>
            {funds.map((fund) => (
              <option key={fund._id} value={fund._id}>{fund.name}</option>
            ))}
          </select>
        </div>
      </div>
      {fromFundId !== "" && fromFundId === toFundId && (
        <p className="text-xs text-error">Choose two different funds.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="transfer-amount" className={LABEL_CLASS}>Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid text-xs">£</span>
            <input
              id="transfer-amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${INPUT_CLASS} pl-6 font-mono`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="transfer-date" className={LABEL_CLASS}>Date</label>
          <input id="transfer-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT_CLASS} font-mono`} />
        </div>
      </div>
      <div>
        <label htmlFor="transfer-note" className={LABEL_CLASS}>Note (optional)</label>
        <input id="transfer-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />
      </div>
      <DialogFooter submitLabel="Record transfer" submitDisabled={!canSubmit} isSaving={isSaving} onClose={onClose} />
    </form>
  );
}

type JournalTransferModalProps = {
  funds: Fund[];
  onClose: () => void;
};

export default function JournalTransferModal({ funds, onClose }: JournalTransferModalProps) {
  const createJournalTransfer = useMutation(api.mutations.movements.createJournalTransfer);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (args: TransferArgs) => {
    setIsSaving(true);
    try {
      await createJournalTransfer(args);
      notify("Transfer recorded", "The money has moved between the two funds.");
      onClose();
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to record the transfer.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TransactionDialog title="New transfer between funds" onClose={onClose}>
      <JournalTransferPanel funds={funds} isSaving={isSaving} onSubmit={handleSubmit} onClose={onClose} />
    </TransactionDialog>
  );
}
