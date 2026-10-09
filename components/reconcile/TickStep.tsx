import { useState } from "react";
import { Check } from "lucide-react";
import { shortDate } from "../cashEntry/format";
import { signedGbp } from "../statementImport/format";
import type { Id } from "../../convex/_generated/dataModel";
import { Segmented, screenHelp, screenTitle, tickBox, tickRow } from "../wizard/ui";

export interface LineTransaction {
  _id: Id<"transactions">;
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expenditure";
}

const TICK_VIEWS = ["To tick", "Ticked"] as const;

const byDate = (a: LineTransaction, b: LineTransaction) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export default function TickStep({
  cleared,
  candidates,
  disabled,
  onToggle,
}: {
  cleared: LineTransaction[];
  candidates: LineTransaction[];
  disabled: boolean;
  onToggle: (transactionId: Id<"transactions">, ticked: boolean) => void;
}) {
  const [view, setView] = useState<(typeof TICK_VIEWS)[number]>("To tick");
  // A completed reconciliation is read-only, so it only shows the lines that were ticked.
  const ticked = disabled || view === "Ticked";
  const lines = [...(ticked ? cleared : candidates)].sort(byDate);

  return (
    <div>
      <h2 className={screenTitle}>Tick what's on the statement</h2>
      {disabled ? (
        <p className={screenHelp}>
          Completed — reopen to change ticks. {cleared.length} ticked.
        </p>
      ) : (
        <p className={screenHelp}>
          Tick each line you can find on the paper statement. {candidates.length} to tick, {cleared.length} ticked.
        </p>
      )}

      {!disabled && (
        <div className="mb-3">
          <Segmented options={TICK_VIEWS} value={view} onChange={setView} label="Show lines" />
        </div>
      )}

      <div className="space-y-2.5">
        {lines.map((line) => {
          const income = line.type === "Income";
          const signed = income ? line.amount : -line.amount;
          return (
            <button
              key={line._id}
              type="button"
              aria-pressed={ticked}
              disabled={disabled}
              onClick={() => onToggle(line._id, !ticked)}
              className={`${tickRow} ${ticked ? "border-ink" : "border-ledger"}`}
            >
              <span className={`${tickBox} ${ticked ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
                {ticked && <Check size={14} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-semibold">{line.description}</b>
                <span className="text-[12.5px] text-grey-mid">{shortDate(line.date)}</span>
              </span>
              <span className={`whitespace-nowrap font-mono text-sm font-semibold ${income ? "text-sage" : "text-ink"}`}>
                {signedGbp(signed)}
              </span>
            </button>
          );
        })}
      </div>

      {lines.length === 0 && (
        <p className="rounded-2xl border border-dashed border-ledger p-4 text-center text-sm text-grey-mid">
          {disabled
            ? "No lines were ticked on this reconciliation."
            : ticked
              ? "Nothing ticked yet. Tap a line when you find it on the statement."
              : "Every line for this fund up to the end of the period is ticked."}
        </p>
      )}
    </div>
  );
}
