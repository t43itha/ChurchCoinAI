import type { ReactNode } from "react";

// Bottom bar of a walkthrough step. `value` is pre-formatted by the caller, so the
// shell never assumes a currency.
export default function StepFooter({
  label,
  value,
  children,
}: {
  label?: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-ledger bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:px-8 lg:pb-6">
      {label !== undefined && value !== undefined && (
        <div className="mb-2.5 flex items-baseline justify-between px-0.5 text-xs text-grey-mid">
          <span>{label}</span>
          <b className="font-mono text-sm text-ink">{value}</b>
        </div>
      )}
      {children}
    </div>
  );
}
