import React from "react";
import { sumMoney } from "../../convex/lib/money";
import type { FundStatement } from "../../lib/reportSummary";
import { formatCurrencyWhole } from "./format";

const FREE_COLOUR = "#557555";
const RESTRICTED_COLOUR = "#a9743f";
const DESIGNATED_COLOUR = "#7b93c4";

export interface FundSplitBarProps {
  statement: FundStatement;
}

// Closing balances split into free-to-spend (Unrestricted) and everything else.
// Negative balances are left out of the bar; they show in the fund statement.
export const FundSplitBar: React.FC<FundSplitBarProps> = ({ statement }) => {
  const rows = statement.rows;
  const free = sumMoney(
    rows.filter((row) => row.type === "Unrestricted"),
    (row) => row.closing
  );
  const other = sumMoney(
    rows.filter((row) => row.type !== "Unrestricted"),
    (row) => row.closing
  );

  const segments = [
    { key: "free", label: "Unrestricted", colour: FREE_COLOUR, value: free },
    {
      key: "restricted",
      label: "Restricted",
      colour: RESTRICTED_COLOUR,
      value: sumMoney(
        rows.filter((row) => row.type !== "Unrestricted" && row.type !== "Designated"),
        (row) => row.closing
      ),
    },
    {
      key: "designated",
      label: "Designated",
      colour: DESIGNATED_COLOUR,
      value: sumMoney(
        rows.filter((row) => row.type === "Designated"),
        (row) => row.closing
      ),
    },
  ].filter((segment) => segment.value > 0);

  const positiveTotal = sumMoney(segments, (segment) => segment.value);

  return (
    <div>
      <div
        role="img"
        aria-label={`Closing balances: ${formatCurrencyWhole(free)} free to spend, ${formatCurrencyWhole(other)} restricted or designated`}
        className="flex h-2 gap-0.5 overflow-hidden rounded bg-grey-light"
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            title={`${segment.label}: ${formatCurrencyWhole(segment.value)}`}
            className="block h-full rounded-sm"
            style={{ width: `${(segment.value / positiveTotal) * 100}%`, backgroundColor: segment.colour }}
          />
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-grey-mid">
        <span className="font-semibold text-sage">{formatCurrencyWhole(free)}</span> free to spend ·{" "}
        {formatCurrencyWhole(other)} restricted/designated
      </p>
    </div>
  );
};
