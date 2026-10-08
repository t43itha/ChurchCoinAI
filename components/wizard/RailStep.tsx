export type RailStepState = "done" | "now" | "todo" | "skipped";

// One row in a walkthrough's left rail. "skipped" is shown struck through and
// cannot be clicked.
export default function RailStep({
  marker,
  label,
  trailing,
  state,
  onClick,
  disabled = false,
}: {
  marker: string;
  label: string;
  trailing?: string;
  state: RailStepState;
  onClick: () => void;
  disabled?: boolean;
}) {
  const skipped = state === "skipped";
  const badge =
    state === "done"
      ? "border-sage bg-sage text-white"
      : state === "now"
        ? "border-ink bg-ink text-white"
        : "border-ledger text-grey-mid";
  const tone =
    state === "now" ? "bg-grey-light text-ink" : state === "done" ? "text-grey-dark" : "text-grey-mid";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || skipped}
      aria-current={state === "now" ? "step" : undefined}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors ${
        skipped ? "cursor-not-allowed line-through opacity-40" : "hover:bg-grey-light"
      } ${tone}`}
    >
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[11px] ${badge}`}
      >
        {state === "done" ? "✓" : marker}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <em className="font-mono text-[11.5px] not-italic text-grey-mid">{trailing}</em>}
    </button>
  );
}
