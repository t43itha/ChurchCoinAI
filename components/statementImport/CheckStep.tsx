import { useState } from "react";
import { isRealIsoDate } from "../../lib/csvImport";
import { sumMoney } from "../../convex/lib/money";
import type { Fund } from "../../types";
import { isValidCategory, rowsMissingFund, type CategoryNamesFor } from "./buckets";
import { FundSelect } from "./ReviewTable";
import { signedGbp } from "./format";
import { gbp } from "../cashEntry/format";
import type { PendingReviewTransaction } from "./types";
import { screenTitle, screenHelp, eyebrow, txtInput } from "../wizard/ui";

export interface ImportBlockers {
  noCategory: number;
  noFund: number;
  badDate: number;
}

// Rows the hook would refuse to import, counted by what is missing.
export function importBlockers(
  rows: PendingReviewTransaction[],
  funds: Fund[],
  namesFor: CategoryNamesFor
): ImportBlockers {
  return {
    noCategory: rows.filter((row) => !isValidCategory(row, namesFor)).length,
    noFund: rows.filter((row) => !funds.some((fund) => fund._id === row.fundId)).length,
    badDate: rows.filter((row) => !isRealIsoDate(row.date ?? "")).length,
  };
}

const signed = (row: PendingReviewTransaction) =>
  row.type === "Income" ? (row.amount ?? 0) : -(row.amount ?? 0);

// Rows with no valid fund, put into one fund in a single step. This is the fix for the
// blocker, so the user never has to walk back through every card.
function FundFix({ count, funds, onApply }: { count: number; funds: Fund[]; onApply: (fundId: string) => void }) {
  const [fundId, setFundId] = useState("");
  return (
    <div className="mt-3.5 flex flex-col gap-2 rounded-2xl border border-amber bg-amber-light px-4 py-3 text-sm text-amber sm:flex-row sm:flex-wrap sm:items-center">
      <span className="font-semibold">
        {count} {count === 1 ? "transaction has" : "transactions have"} no fund. Put {count === 1 ? "it" : "them"} in
      </span>
      <div className="flex min-w-0 flex-1 gap-2">
        <FundSelect label="Fund for rows with no fund" value={fundId} funds={funds} onChange={setFundId} className={`${txtInput} min-w-0 flex-1 font-semibold`} />
        <button
          type="button"
          disabled={!fundId}
          onClick={() => onApply(fundId)}
          className="min-h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-35"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

interface CheckStepProps {
  rows: PendingReviewTransaction[];
  funds: Fund[];
  onAssignFund: (fundId: string) => void;
  duplicateCount: number;
  pairedCount: number;
  alreadyImported: number;
  onLookDuplicates: () => void;
}

// The last look before anything is saved: totals, where the money goes, and possible duplicates.
export default function CheckStep({ rows, funds, onAssignFund, duplicateCount, pairedCount, alreadyImported, onLookDuplicates }: CheckStepProps) {
  const missingFund = rowsMissingFund(rows, new Set(funds.map((fund) => fund._id))).length;
  const moneyIn = sumMoney(rows.filter((row) => row.type === "Income"), (row) => row.amount ?? 0);
  const moneyOut = sumMoney(rows.filter((row) => row.type !== "Income"), (row) => row.amount ?? 0);

  // Net per fund, in the order of the fund list. Rows with no known fund go last.
  const byFund = funds
    .map((fund) => ({
      name: fund.name,
      net: sumMoney(rows.filter((row) => row.fundId === fund._id), signed),
      count: rows.filter((row) => row.fundId === fund._id).length,
    }))
    .filter((entry) => entry.count > 0);
  const unfunded = rows.filter((row) => !funds.some((fund) => fund._id === row.fundId));
  if (unfunded.length > 0) {
    byFund.push({ name: "No fund yet", net: sumMoney(unfunded, signed), count: unfunded.length });
  }

  return (
    <div>
      <h2 className={screenTitle}>
        {rows.length > 0 ? `Ready to add ${rows.length} transaction${rows.length === 1 ? "" : "s"}` : "Nothing new to add"}
      </h2>
      <p className={screenHelp}>
        Totals for this statement, before anything is saved.
        {alreadyImported > 0 && ` ${alreadyImported} already imported ${alreadyImported === 1 ? "row is" : "rows are"} left out.`}
      </p>

      <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-ledger bg-white p-4">
        <div>
          <b className="block font-mono text-lg text-sage">{gbp(moneyIn)}</b>
          <span className="text-xs text-grey-mid">Money in</span>
        </div>
        <div>
          <b className="block font-mono text-lg text-ink">{gbp(moneyOut)}</b>
          <span className="text-xs text-grey-mid">Money out</span>
        </div>
        <div>
          <b className="block font-mono text-lg text-ink">{pairedCount}</b>
          <span className="text-xs text-grey-mid">Transfers paired</span>
        </div>
      </div>

      {missingFund > 0 && <FundFix count={missingFund} funds={funds} onApply={onAssignFund} />}

      {byFund.length > 0 && (
        <div className="mt-3.5 rounded-2xl border border-ledger bg-white px-4 py-1.5">
          <div className={`${eyebrow} pb-1 pt-2.5`}>Where it goes</div>
          {byFund.map((entry) => (
            <div key={entry.name} className="flex items-baseline justify-between gap-3 border-b border-dashed border-ledger py-2 text-sm last:border-b-0">
              <span className="min-w-0 truncate text-grey-dark">{entry.name}</span>
              <b className="whitespace-nowrap font-mono">{signedGbp(entry.net)}</b>
            </div>
          ))}
        </div>
      )}

      {duplicateCount > 0 && (
        <div className="mt-3.5 flex flex-col gap-2 rounded-2xl bg-amber-light px-4 py-3 text-sm text-amber sm:flex-row sm:items-center sm:justify-between">
          <span>
            <b>{duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"}.</b> The ledger already has a row with the same date and amount.
          </span>
          <button type="button" onClick={onLookDuplicates} className="min-h-11 self-start text-sm font-bold underline sm:self-auto">
            Look at {duplicateCount === 1 ? "it" : "them"}
          </button>
        </div>
      )}
    </div>
  );
}
