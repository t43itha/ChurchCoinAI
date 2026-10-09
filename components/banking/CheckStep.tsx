import type { CashBankingVarianceType } from "../../types";
import { gbp } from "../cashEntry/format";
import { chip, fieldLabel, screenHelp, screenTitle, txtArea } from "../wizard/ui";
import { MIN_NOTE_LENGTH, VARIANCE_OPTIONS } from "./draft";

interface CheckStepProps {
  counted: number;
  collectionCount: number;
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
  variance,
  varianceType,
  note,
  onVarianceType,
  onNote,
}: CheckStepProps) {
  const collectionsLabel = `${collectionCount} collection${collectionCount === 1 ? "" : "s"}`;

  if (variance === null) {
    return (
      <div>
        <h2 className={screenTitle}>Does it add up?</h2>
        <p className={screenHelp}>Fix the amounts on the earlier steps first.</p>
      </div>
    );
  }

  if (variance === 0) {
    return (
      <div>
        <h2 className={screenTitle}>Does it add up?</h2>
        <p className={screenHelp}>Counted against what the bank shows.</p>
        <p className="rounded-2xl bg-sage-light px-3.5 py-3 text-sm font-semibold text-sage">
          Matches the count. {gbp(counted)} counted across {collectionsLabel}.
        </p>
      </div>
    );
  }

  const more = variance > 0;
  return (
    <div>
      <h2 className={screenTitle}>Does it add up?</h2>
      <p className={screenHelp}>Counted against what the bank shows.</p>
      <p className="rounded-2xl bg-amber-light px-3.5 py-3 text-sm font-semibold text-amber">
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
