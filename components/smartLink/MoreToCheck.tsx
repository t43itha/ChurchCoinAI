import { Search } from "lucide-react";
import { btnMd, btnOutline, card } from "../wizard/ui";

interface MoreToCheckProps {
  remaining: number;
  isChecking: boolean;
  onCheckMore: () => void;
}

// Smart Link checks gifts a batch at a time, oldest first. While some are
// left, say how many, so a list of suggestions never looks complete when it isn't.
export default function MoreToCheck({ remaining, isChecking, onCheckMore }: MoreToCheckProps) {
  if (remaining <= 0) return null;
  return (
    <div className={`${card} mt-3`} role="status">
      <p className="text-sm font-semibold text-ink">{remaining.toLocaleString("en-GB")} more to check</p>
      <p className="mt-0.5 text-xs text-grey-mid">
        Unlinked {remaining === 1 ? "gift" : "gifts"} not checked yet. Smart Link checks a batch at a time.
      </p>
      <button type="button" onClick={onCheckMore} disabled={isChecking} className={`${btnOutline} ${btnMd} mt-3`}>
        <Search size={15} aria-hidden="true" />
        {isChecking ? "Checking…" : "Check more"}
      </button>
    </div>
  );
}
