import DateInput from "../cashEntry/DateInput";
import { gbp } from "../cashEntry/format";
import { amtBox, amtInput, amtSymbol, fieldLabel, screenHelp, screenTitle, txtInput } from "../wizard/ui";

interface TransferAmountStepProps {
  fromName: string;
  toName: string;
  amountText: string;
  onAmountChange: (value: string) => void;
  // Set while the typed amount is not one the transfer can use.
  amountError: string | null;
  date: string;
  onDateChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  // Pence the source fund would be overdrawn by. Zero when it stays in credit.
  overdraftPence: number;
}

export default function TransferAmountStep({
  fromName,
  toName,
  amountText,
  onAmountChange,
  amountError,
  date,
  onDateChange,
  note,
  onNoteChange,
  overdraftPence,
}: TransferAmountStepProps) {
  return (
    <div>
      <h2 className={screenTitle}>How much, and when?</h2>
      <p className={screenHelp}>{`Moving money from ${fromName} to ${toName}.`}</p>

      <label htmlFor="transfer-amount" className={fieldLabel}>
        Amount
      </label>
      <div className={amtBox}>
        <span className={amtSymbol}>£</span>
        <input
          id="transfer-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amountText}
          onChange={(event) => onAmountChange(event.target.value)}
          aria-invalid={amountError !== null}
          aria-describedby={amountError ? "transfer-amount-error" : undefined}
          className={amtInput}
        />
      </div>
      {amountError && (
        <p id="transfer-amount-error" className="mt-1.5 text-xs text-error">
          {amountError}
        </p>
      )}

      <span className={fieldLabel}>Date</span>
      <DateInput
        aria-label="Date"
        value={date}
        onChange={(event) => onDateChange(event.target.value)}
        className={`${txtInput} min-w-0`}
      />

      <label htmlFor="transfer-note" className={fieldLabel}>
        Note (optional)
      </label>
      <input
        id="transfer-note"
        type="text"
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        className={txtInput}
      />

      {overdraftPence > 0 && (
        <p className="mt-4 rounded-2xl bg-amber-light p-3.5 text-sm text-amber">
          {`${fromName} would be ${gbp(overdraftPence / 100)} overdrawn after this. You can still record it.`}
        </p>
      )}
    </div>
  );
}
