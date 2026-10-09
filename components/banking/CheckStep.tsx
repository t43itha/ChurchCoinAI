import type { CashBankingVarianceType } from "../../types";
import { gbp } from "../cashEntry/format";
import { chip, fieldLabel, screenHelp, screenTitle, txtArea } from "../wizard/ui";
import { countLabel } from "./format";
import { MIN_NOTE_LENGTH, VARIANCE_OPTIONS } from "./draft";

interface CheckStepProps {
  counted: number;
  collectionCount: number;
  banked: number;
  bankCount: number;
  // Null while an amount is invalid, which the walkthrough does not let the user reach.
  variance: number | null;
  varianceType: CashBankingVarianceType | "";
  note: string;
  onVarianceType: (value: CashBankingVarianceType) => void;
  onNote: (value: string) => void;
}

export default function CheckStep({
  counted,
  collectionCount,
  banked,
  bankCount,
  variance,
  varianceType,
  note,
  onVarianceType,
  onNote,
}: CheckStepProps) {
  if (variance === null) {
    return (
      <div>
        <h2 className={screenTitle}>Does it add up?</h2>
        <p className={screenHelp}>Fix the amounts on the earlier steps first.</p>
      </div>
    );
  }

  // The receipt beside this step only shows from lg up, so phones read the two totals here.
  const totals = (
    <dl className="mt-4 divide-y divide-ledger rounded-2xl border border-ledger bg-white px-3.5 text-sm lg:hidden">
      <div className="flex items-baseline justify-between gap-3 py-2.5">
        <dt className="text-grey-mid">Counted</dt>
        <dd className="text-right">
          <span className="block font-mono font-semibold text-ink">{gbp(counted)}</span>
          <span className="text-xs text-grey-mid">{countLabel(collectionCount, "collection")}</span>
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 py-2.5">
        <dt className="text-grey-mid">In the bank</dt>
        <dd className="text-right">
          <span className="block font-mono font-semibold text-ink">{gbp(banked)}</span>
          <span className="text-xs text-grey-mid">{countLabel(bankCount, "bank credit")}</span>
        </dd>
      </div>
    </dl>
  );

  if (variance === 0) {
    return (
      <div>
        <h2 className={screenTitle}>Does it add up?</h2>
        <p className={screenHelp}>Counted against what the bank shows.</p>
        {totals}
        <p className="mt-4 rounded-2xl bg-sage-light px-3.5 py-3 text-sm font-semibold text-sage">
          Matches the count. {gbp(counted)} counted across {countLabel(collectionCount, "collection")}.
        </p>
      </div>
    );
  }

  const more = variance > 0;
  return (
    <div>
      <h2 className={screenTitle}>Does it add up?</h2>
      <p className={screenHelp}>Counted against what the bank shows.</p>
      {totals}
      <p className="mt-4 rounded-2xl bg-amber-light px-3.5 py-3 text-sm font-semibold text-amber">
        The bank shows {gbp(Math.abs(variance))} {more ? "more" : "less"} than was counted.
      </p>

      <span className={fieldLabel}>Why is it different?</span>
      <div className="flex flex-wrap gap-2">
        {VARIANCE_OPTIONS.map((option) => {
          const on = option.value === varianceType;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onVarianceType(option.value)}
              className={`${chip} ${on ? "!border-ink bg-ink text-white" : ""}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="banking-variance-note" className={fieldLabel}>
        Note
      </label>
      <textarea
        id="banking-variance-note"
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="Say what the difference is"
        className={txtArea}
      />
      <p className="mt-1.5 text-xs text-grey-mid">
        {note.trim().length < MIN_NOTE_LENGTH ? `At least ${MIN_NOTE_LENGTH} characters.` : "Saved with the banking."}
      </p>
    </div>
  );
}
