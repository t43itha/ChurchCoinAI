import { Check, X } from "lucide-react";
import type { Transaction } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnOutline, btnPrimary, btnSage, screenTitle } from "../wizard/ui";
import { formatWholePounds } from "./logic";

export type PledgeMatch = {
  transactionId: string;
  pledgeId: string;
  donorName?: string;
  reason: string;
};

export interface MatchSheetProps {
  matches: PledgeMatch[];
  transactions: Transaction[];
  onConfirm: (match: PledgeMatch) => void;
  onDismiss: (match: PledgeMatch) => void;
  onClose: () => void;
}

// Suggested links from the AI match. Each one is confirmed or dismissed on its own.
export default function MatchSheet({ matches, transactions, onConfirm, onDismiss, onClose }: MatchSheetProps) {
  const rows = matches.flatMap((match) => {
    const transaction = transactions.find((candidate) => candidate._id === match.transactionId);
    return transaction ? [{ match, transaction }] : [];
  });

  return (
    <WizardFrame
      ariaLabel="Suggested links"
      title="Suggested links"
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" onClick={onClose} className={`${btnPrimary} ${btnLg}`}>
            Done
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Gifts that may match a pledge</h2>
      <p className="mb-4 mt-1.5 text-[13.5px] text-grey-mid">Confirm the ones that are right. Dismissing one removes it from this list.</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ledger bg-white px-4 py-3.5 text-sm font-semibold text-sage">No suggested links left.</p>
      ) : (
        <ul className="grid gap-2.5">
          {rows.map(({ match, transaction }) => (
            <li key={`${match.transactionId}-${match.pledgeId}`} className="rounded-2xl border border-ledger bg-white p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <b className="min-w-0 truncate text-[14.5px] text-ink">{transaction.description}</b>
                <span className="shrink-0 font-mono text-sm font-bold text-sage">{formatWholePounds(transaction.amount)}</span>
              </div>
              <p className="mt-0.5 text-xs text-grey-mid">
                {transaction.date}
                {match.donorName ? ` · ${match.donorName}` : ""}
              </p>
              <p className="mt-2 text-xs italic text-grey-dark">{match.reason}</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => onDismiss(match)} className={`${btnOutline} h-10 !w-auto px-3.5 text-sm`}>
                  <X size={14} aria-hidden="true" />
                  Dismiss
                </button>
                <button type="button" onClick={() => onConfirm(match)} className={`${btnSage} h-10 !w-auto px-3.5 text-sm`}>
                  <Check size={14} aria-hidden="true" />
                  Confirm link
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WizardFrame>
  );
}
