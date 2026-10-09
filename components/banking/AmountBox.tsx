import { amtBox, amtInput, amtSymbol } from "../wizard/ui";

// A pounds box for typed money. The label is the visible caption; ariaLabel says what it is for.
export default function AmountBox({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs font-semibold text-grey-mid">{label}</span>
      <label className={amtBox}>
        <span className={amtSymbol}>£</span>
        <input
          aria-label={ariaLabel}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={amtInput}
        />
      </label>
    </div>
  );
}
