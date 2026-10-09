import { amtBox, amtInput, amtSymbol, fieldLabel, screenHelp, screenTitle } from "../wizard/ui";

export interface BalanceValues {
  opening: string;
  closing: string;
}

// Typed as text so negative balances and pence can be entered as on the statement.
export default function BalancesStep({
  values,
  onChange,
  disabled = false,
}: {
  values: BalanceValues;
  onChange: (patch: Partial<BalanceValues>) => void;
  // A completed reconciliation shows its balances read-only.
  disabled?: boolean;
}) {
  return (
    <div>
      <h2 className={screenTitle}>What does the statement say?</h2>
      <p className={screenHelp}>Copy the opening and closing balances from the statement.</p>

      <label htmlFor="reconcile-opening" className={fieldLabel}>
        Opening balance
      </label>
      <div className={amtBox}>
        <span className={amtSymbol}>£</span>
        <input
          id="reconcile-opening"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={values.opening}
          disabled={disabled}
          onChange={(event) => onChange({ opening: event.target.value })}
          className={amtInput}
        />
      </div>

      <label htmlFor="reconcile-closing" className={fieldLabel}>
        Closing balance
      </label>
      <div className={amtBox}>
        <span className={amtSymbol}>£</span>
        <input
          id="reconcile-closing"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={values.closing}
          disabled={disabled}
          onChange={(event) => onChange({ closing: event.target.value })}
          className={amtInput}
        />
      </div>
    </div>
  );
}
