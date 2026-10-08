import type { ReactNode } from "react";
import { receipt } from "./ui";

// The dashed-edge receipt frame. Callers supply the rows.
export function ReceiptCard({ className = "", children }: { className?: string; children?: ReactNode }) {
  return <div className={`${receipt} ${className}`}>{children}</div>;
}

// One label/value line. `value` is pre-formatted; `dim` greys out an empty line.
export function ReceiptRow({
  label,
  value,
  sub,
  muted,
  dim,
}: {
  label: string;
  value: ReactNode;
  sub?: boolean;
  muted?: boolean;
  dim?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2.5 py-1 text-sm ${dim ? "text-[#b8b3ab]" : ""}`}>
      <span className={`min-w-0 ${sub ? "pl-3 text-grey-dark" : ""} ${muted ? "text-grey-mid" : ""}`}>{label}</span>
      <span className="whitespace-nowrap font-mono font-semibold">{value}</span>
    </div>
  );
}
