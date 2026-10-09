import { Check, Wand2, X } from "lucide-react";
import type { Transaction } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnMd, btnOutline, btnPrimary, btnSage, card, screenHelp, screenTitle } from "../wizard/ui";
import { formatSignedAmount } from "./transactionView";

export interface SmartLinkMatch {
  transactionId: string;
  pledgeId: string;
  donorName?: string;
  reason: string;
}

interface SmartLinkSheetProps {
  matches: SmartLinkMatch[];
  transactions: Transaction[];
  onConfirm: (match: SmartLinkMatch) => void;
  onIgnore: (match: SmartLinkMatch) => void;
  onClose: () => void;
}

// Suggested links between unlinked income and pledges. Nothing changes until a match is confirmed.
export default function SmartLinkSheet({ matches, transactions, onConfirm, onIgnore, onClose }: SmartLinkSheetProps) {
  const rows = matches.flatMap((match) => {
    const transaction = transactions.find((t) => t._id === match.transactionId);
    return transaction ? [{ match, transaction }] : [];
  });

  return (
    <WizardFrame
      ariaLabel="Smart Link suggestions"
      title="Smart Link"
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" onClick={onClose} className={`${btnPrimary} h-[54px] text-base`}>
            Done
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>
        <Wand2 size={18} className="mr-1.5 inline align-[-2px] text-sage" aria-hidden="true" />
        {rows.length} possible {rows.length === 1 ? "match" : "matches"}
      </h2>
      <p className={screenHelp}>Unlinked income that looks like a pledge payment. Confirm the ones that are right.</p>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ledger bg-white px-4 py-3.5 text-sm font-semibold text-sage">
          All suggestions are dealt with.
        </p>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ match, transaction }) => (
            <article key={`${match.transactionId}-${match.pledgeId}`} className={card}>
              <p className="text-sm font-semibold text-ink">{transaction.description}</p>
              <p className="mt-0.5 font-mono text-xs text-grey-mid">
                {transaction.date} · {formatSignedAmount(transaction)}
              </p>
              <p className="mt-2 text-sm text-grey-dark">
                Suggested: link to <b>{match.donorName}</b>
              </p>
              <p className="mt-1 text-xs italic text-grey-mid">{match.reason}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onIgnore(match)} className={`${btnOutline} ${btnMd}`}>
                  <X size={15} aria-hidden="true" /> Ignore
                </button>
                <button type="button" onClick={() => onConfirm(match)} className={`${btnSage} ${btnMd}`}>
                  <Check size={15} aria-hidden="true" /> Confirm
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </WizardFrame>
  );
}
