import { Building2, RefreshCw } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { formatLocalDateInputValue, formatUkDate } from "../../lib/dateUtils";
import WizardFrame from "../wizard/WizardFrame";
import { nextIcon, nextItem, screenHelp, screenTitle } from "../wizard/ui";

export interface BankAccountOption {
  _id: Id<"bankConnections">;
  institutionName: string;
  accounts: readonly unknown[];
  lastSyncAt?: string | number;
}

// Shown only when more than one bank is connected.
export default function BankAccountSheet({
  connections,
  onPick,
  onClose,
}: {
  connections: readonly BankAccountOption[];
  onPick: (id: Id<"bankConnections">) => void;
  onClose: () => void;
}) {
  return (
    <WizardFrame ariaLabel="Choose a bank account" title="Sync bank" onClose={onClose}>
      <h2 className={screenTitle}>Which bank?</h2>
      <p className={screenHelp}>Pick the account to pull the latest lines from.</p>
      <div className="grid gap-2">
        {connections.map((item) => (
          <button key={item._id} type="button" onClick={() => onPick(item._id)} className={nextItem}>
            <span className={`${nextIcon} bg-grey-light text-grey-dark`} aria-hidden="true">
              <Building2 size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] text-ink">{item.institutionName}</b>
              <span className="block text-xs text-grey-mid">
                {item.accounts.length} account{item.accounts.length === 1 ? "" : "s"} mapped
                {item.lastSyncAt !== undefined && ` · last sync ${formatUkDate(formatLocalDateInputValue(new Date(item.lastSyncAt)))}`}
              </span>
            </span>
            <RefreshCw size={16} className="shrink-0 text-grey-mid" aria-hidden="true" />
          </button>
        ))}
      </div>
    </WizardFrame>
  );
}
