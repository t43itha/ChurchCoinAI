import { Check } from "lucide-react";
import DateInput from "../cashEntry/DateInput";
import type { Fund } from "../../types";
import type { Id } from "../../convex/_generated/dataModel";
import { btnMd, btnOutline, fieldLabel, screenHelp, screenTitle, tickBox, tickRow, txtInput } from "../wizard/ui";
import { periodLabel } from "./format";

export interface AccountValues {
  fundId: string;
  periodStart: string;
  periodEnd: string;
}

interface AccountStepProps {
  funds: Fund[];
  values: AccountValues;
  // Set once the statement is saved: the fund belongs to the session and cannot move.
  fundLocked: boolean;
  // The other open reconciliation for the picked fund, if there is one.
  openSession?: { _id: Id<"reconciliationSessions">; periodStart: string; periodEnd: string };
  onChange: (patch: Partial<AccountValues>) => void;
  onContinue: (sessionId: Id<"reconciliationSessions">) => void;
}

export default function AccountStep({ funds, values, fundLocked, openSession, onChange, onContinue }: AccountStepProps) {
  return (
    <div>
      <h2 className={screenTitle}>Which account and month?</h2>
      <p className={screenHelp}>Pick the fund this bank statement belongs to.</p>

      <div className="space-y-2.5">
        {funds.map((fund) => {
          const on = fund._id === values.fundId;
          return (
            <button
              key={fund._id}
              type="button"
              aria-pressed={on}
              disabled={fundLocked}
              onClick={() => onChange({ fundId: fund._id })}
              className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
            >
              <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
                {on && <Check size={14} aria-hidden="true" />}
              </span>
              <b className="min-w-0 flex-1 truncate text-[14.5px]">{fund.name}</b>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <span className={fieldLabel}>From</span>
          <DateInput
            aria-label="From"
            value={values.periodStart}
            onChange={(event) => onChange({ periodStart: event.target.value })}
            className={`${txtInput} min-w-0`}
          />
        </div>
        <div>
          <span className={fieldLabel}>To</span>
          <DateInput
            aria-label="To"
            value={values.periodEnd}
            onChange={(event) => onChange({ periodEnd: event.target.value })}
            className={`${txtInput} min-w-0`}
          />
        </div>
      </div>

      {openSession && (
        <div className="mt-4 rounded-2xl bg-amber-light p-3.5 text-sm text-amber">
          <p>
            This fund already has an open reconciliation for{" "}
            {periodLabel(openSession.periodStart, openSession.periodEnd)}.
          </p>
          <button
            type="button"
            onClick={() => onContinue(openSession._id)}
            className={`${btnOutline} ${btnMd} mt-2.5`}
          >
            Continue it
          </button>
        </div>
      )}
    </div>
  );
}
