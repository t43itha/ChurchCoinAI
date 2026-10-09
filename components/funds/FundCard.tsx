import { meetsMoneyTarget } from "../../convex/lib/money";
import { FundType, type Fund } from "../../types";
import { formatCurrency } from "../dashboard/formatters";
import { card, linkBtnSm, tagAmber, tagGrey, tagSage } from "../wizard/ui";
import { PLAIN_TYPE_NAME, formatPounds, targetPercent } from "./fundFacts";

const TYPE_TAG: Record<FundType, string> = {
  [FundType.UNRESTRICTED]: tagSage,
  [FundType.DESIGNATED]: tagAmber,
  [FundType.RESTRICTED]: tagGrey,
  [FundType.ENDOWMENT]: tagGrey,
};

export function FundTypeTag({ type }: { type: FundType }) {
  return <span className={TYPE_TAG[type]}>{type}</span>;
}

export interface FundCardProps {
  fund: Fund;
  movement: number;
  monthsCovered: number | null;
  // Balance is below what the fund spent this month.
  belowMonthlySpend: boolean;
  canMoveMoney: boolean;
  onOpen: () => void;
  onMoveMoney: () => void;
}

export default function FundCard({
  fund,
  movement,
  monthsCovered,
  belowMonthlySpend,
  canMoveMoney,
  onOpen,
  onMoveMoney,
}: FundCardProps) {
  const overdrawn = fund.balance < 0;
  const target = fund.targetAmount && fund.targetAmount > 0 ? fund.targetAmount : undefined;
  const percent = target === undefined ? 0 : targetPercent(fund.balance, target);

  const facts = [
    movement === 0
      ? "No change this month"
      : `${movement > 0 ? "+" : "−"}${formatPounds(Math.abs(movement))} this month`,
    monthsCovered !== null ? `covers ${monthsCovered.toFixed(1)} months` : null,
    belowMonthlySpend ? "below this month's spending" : null,
  ].filter(Boolean);

  return (
    <article className={`${card} p-4 ${overdrawn ? "ring-2 ring-amber" : ""}`}>
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[15px] text-ink">{fund.name}</b>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <FundTypeTag type={fund.type} />
            <span className="text-xs text-grey-mid">{PLAIN_TYPE_NAME[fund.type]}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block font-mono text-[17px] font-bold tabular-nums ${overdrawn ? "text-error" : "text-ink"}`}>
            {formatPounds(fund.balance)}
          </span>
        </span>
      </button>

      <p className="mt-2.5 text-xs text-grey-mid">{facts.join(" · ")}</p>

      {target !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-grey-mid">
            <span>{meetsMoneyTarget(fund.balance, target) ? "Target reached" : `${Math.round(percent)}% of ${formatCurrency(target)}`}</span>
          </div>
          <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-[#eceae5]" aria-hidden="true">
            <div className="h-full rounded-full bg-[#c79a5f]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {overdrawn && canMoveMoney && (
        <button type="button" onClick={onMoveMoney} className={`${linkBtnSm} mt-1`}>
          Move money to cover it
        </button>
      )}
    </article>
  );
}
