import { Check } from "lucide-react";
import { gbp } from "../cashEntry/format";
import type { Fund } from "../../types";
import { fieldLabel, screenHelp, screenTitle, tagGrey, tickBox, tickRow } from "../wizard/ui";

interface TransferFundsStepProps {
  funds: Fund[];
  fromFundId: string;
  toFundId: string;
  onFrom: (fundId: string) => void;
  onTo: (fundId: string) => void;
}

export default function TransferFundsStep({ funds, fromFundId, toFundId, onFrom, onTo }: TransferFundsStepProps) {
  return (
    <div>
      <h2 className={screenTitle}>Which funds?</h2>
      <p className={screenHelp}>Pick the fund the money leaves, then the fund it goes into.</p>
      <FundGroup label="Take from" funds={funds} value={fromFundId} blockedId={toFundId} onChoose={onFrom} />
      <FundGroup label="Put into" funds={funds} value={toFundId} blockedId={fromFundId} onChoose={onTo} />
    </div>
  );
}

// A fund picked on one side can't be picked on the other.
function FundGroup({
  label,
  funds,
  value,
  blockedId,
  onChoose,
}: {
  label: string;
  funds: Fund[];
  value: string;
  blockedId: string;
  onChoose: (fundId: string) => void;
}) {
  return (
    <>
      <span className={fieldLabel}>{label}</span>
      <div className="space-y-2.5">
        {funds.map((fund) => {
          const on = fund._id === value;
          return (
            <button
              key={fund._id}
              type="button"
              aria-pressed={on}
              disabled={fund._id === blockedId}
              onClick={() => onChoose(fund._id)}
              className={`${tickRow} disabled:opacity-40 ${on ? "border-ink" : "border-ledger"}`}
            >
              <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
                {on && <Check size={14} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-semibold">{fund.name}</b>
                <span className={`${tagGrey} mt-0.5`}>{fund.type}</span>
              </span>
              <span
                className={`whitespace-nowrap font-mono text-sm font-semibold ${fund.balance < 0 ? "text-error" : "text-ink"}`}
              >
                {gbp(fund.balance)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
