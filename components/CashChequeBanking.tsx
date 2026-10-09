import { useState } from "react";
import { useQuery } from "convex/react";
import { Lock, RotateCcw } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { sumMoney } from "../convex/lib/money";
import { formatLocalDateInputValue } from "../lib/dateUtils";
import { can } from "../lib/permissions";
import type { AppUser, Fund } from "../types";
import { gbp } from "./cashEntry/format";
import BankingWizard from "./banking/BankingWizard";
import ReopenSheet from "./banking/ReopenSheet";
import { countLabel, historyDate } from "./banking/format";
import {
  btnMd,
  btnOutline,
  btnPrimary,
  darkCard,
  fieldLabel,
  nextIcon,
  nextItem,
  screenHelp,
  screenTitle,
  tagAmber,
  tagSage,
} from "./wizard/ui";

type BankingRecord = Doc<"cashBankingReconciliations">;

interface CashChequeBankingProps {
  funds: Fund[];
  currentUser: AppUser;
}

const HISTORY_LIMIT = 8;

// The date a banking was completed, or last changed if it has not been completed.
const dateOf = (record: BankingRecord) => historyDate(formatLocalDateInputValue(new Date(record.completedAt ?? record.updatedAt)));

// The hub for cash and cheque banking: what is waiting, the reopened bankings that need finishing,
// and the recent history. The walkthrough and the reopen sheet open from here.
export default function CashChequeBanking({ funds, currentUser }: CashChequeBankingProps) {
  const canBank = can(currentUser.role, "reconciliation.manage");
  const awaiting = useQuery(api.queries.cashBankingReconciliations.getAwaitingBanking, canBank ? {} : "skip");
  const history = useQuery(api.queries.cashBankingReconciliations.list, canBank ? {} : "skip");
  const [walkthrough, setWalkthrough] = useState<{ reconciliation?: BankingRecord } | null>(null);
  const [reopening, setReopening] = useState<BankingRecord | null>(null);

  const header = (
    <header>
      <h2 className={screenTitle}>Bank cash and cheques</h2>
      <p className={screenHelp}>Match the cash and cheques you counted to the deposits on your bank statement.</p>
    </header>
  );

  if (!canBank) {
    return (
      <div className="space-y-6">
        {header}
        <p className="flex items-center gap-2 rounded-2xl border border-ledger bg-white p-4 text-sm text-grey-mid">
          <Lock size={15} aria-hidden="true" />
          Read-only: Admin or Finance Team required to bank cash and cheques.
        </p>
      </div>
    );
  }

  const waiting = awaiting ?? [];
  const waitingTotal = sumMoney(waiting, (collection) => collection.openTotal);
  const records = history ?? [];
  const reopened = records.filter((record) => record.status === "reopened");
  const recent = records
    .filter((record) => record.status === "completed" || record.status === "reopened")
    .slice(0, HISTORY_LIMIT);

  return (
    <div className="space-y-6">
      {header}

      <section className={darkCard}>
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">Waiting to be banked</div>
        {awaiting === undefined ? (
          <p className="mt-2 text-sm text-white/70">Checking what is waiting…</p>
        ) : waiting.length === 0 ? (
          <p className="mt-2 text-xl font-bold">Everything counted has been banked.</p>
        ) : (
          <>
            <div className="mt-2 font-mono text-[34px] font-bold leading-none tracking-tight">{gbp(waitingTotal)}</div>
            <p className="mt-2 text-sm text-white/70">
              {countLabel(waiting.length, "collection")} with cash or cheques still to bank
            </p>
          </>
        )}
      </section>

      <div>
        <button
          type="button"
          disabled={waiting.length === 0}
          onClick={() => setWalkthrough({})}
          className={`${btnPrimary} ${btnMd} !w-auto px-5`}
        >
          Bank cash and cheques
        </button>
        {awaiting !== undefined && waiting.length === 0 && (
          <p className="mt-2 text-xs text-grey-mid">Nothing is waiting to be banked.</p>
        )}
      </div>

      {reopened.length > 0 && (
        <section>
          <span className={fieldLabel}>Needs you</span>
          <div className="space-y-2.5">
            {reopened.map((record) => (
              <button
                key={record._id}
                type="button"
                onClick={() => setWalkthrough({ reconciliation: record })}
                className={nextItem}
              >
                <span className={`${nextIcon} bg-amber-light text-amber`}>
                  <RotateCcw size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[14.5px] text-ink">Finish the reopened banking</b>
                  {record.reopenReason && (
                    <span className="block truncate text-xs text-grey-mid">{record.reopenReason}</span>
                  )}
                </span>
                <span className="whitespace-nowrap font-mono text-sm text-ink">{gbp(record.bankedTotal)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <span className={fieldLabel}>Recent bankings</span>
          <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {recent.map((record) => {
              const reopenedRecord = record.status === "reopened";
              return (
                <li key={record._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  {/* Full width on phones so the date never wraps; the amount, tag and Reopen then sit on the line below. */}
                  <span className="w-full min-w-0 sm:w-auto sm:min-w-[140px] sm:flex-1">
                    <b className="block whitespace-nowrap text-[14.5px] text-ink">{dateOf(record)}</b>
                    <span className="text-[12.5px] text-grey-mid">
                      {countLabel(record.cashCollectionIds.length, "collection")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="whitespace-nowrap font-mono text-sm text-ink">{gbp(record.bankedTotal)}</span>
                    <span className={reopenedRecord ? tagAmber : tagSage}>{reopenedRecord ? "Reopened" : "Completed"}</span>
                    {record.status === "completed" && (
                      <button
                        type="button"
                        onClick={() => setReopening(record)}
                        className={`${btnOutline} ${btnMd} !w-auto px-4`}
                      >
                        Reopen
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {reopening && (
        <ReopenSheet
          reconciliation={reopening}
          onCancel={() => setReopening(null)}
          onReopened={(record) => {
            setReopening(null);
            setWalkthrough({ reconciliation: record });
          }}
        />
      )}

      {walkthrough && (
        <BankingWizard
          funds={funds}
          reconciliation={walkthrough.reconciliation}
          onClose={() => setWalkthrough(null)}
        />
      )}
    </div>
  );
}
