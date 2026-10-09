import SectionTitle from "../hub/SectionTitle";
import { formatCurrency } from "./formatters";
import type { DashboardSummaryProps } from "./types";

// Overdrawn funds, low balances and open campaigns. Healthy funds live on the Funds page.
export default function DashboardFundsToWatch({ summary }: DashboardSummaryProps) {
  const { campaigns, overdrawnFunds, lowBalanceFunds } = summary.funds;
  const count = overdrawnFunds.length + lowBalanceFunds.length + campaigns.length;

  return (
    <section className="min-w-0 rounded-2xl border border-ledger bg-white p-4 md:p-5" aria-label="Funds to watch">
      <SectionTitle link={{ label: "All funds", to: "/funds" }}>
        Funds to watch <span className="ml-1 font-mono text-grey-mid">{count}</span>
      </SectionTitle>

      {count === 0 ? (
        <p className="mt-4 text-sm font-semibold text-sage">Nothing needs watching.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#efeee9]">
          {overdrawnFunds.map((fund) => (
            <FundRow
              key={`overdrawn-${fund.fundId}`}
              name={fund.name}
              balance={fund.balance}
              note="Overdrawn"
              valueClass="text-[#b53d3d]"
            />
          ))}
          {lowBalanceFunds.map((fund) => (
            <FundRow
              key={`low-${fund.fundId}`}
              name={fund.name}
              balance={fund.balance}
              note="Low balance"
              valueClass="text-[#a9743f]"
            />
          ))}
          {campaigns.map((campaign) => (
            <li key={`campaign-${campaign.fundId}`} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <b className="min-w-0 break-words text-sm text-ink">{campaign.name}</b>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[#a9743f]">
                  {campaign.progressPercent}%
                </span>
              </div>
              <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-[#eceae5]" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-sage"
                  style={{ width: `${clampPercent(campaign.progressPercent)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-grey-mid">
                {formatCurrency(campaign.balance)} of {formatCurrency(campaign.targetAmount)}
                {campaign.deadline ? ` · Due ${formatDeadline(campaign.deadline)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FundRow({
  name,
  balance,
  note,
  valueClass,
}: {
  name: string;
  balance: number;
  note: string;
  valueClass: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="min-w-0">
        <b className="block break-words text-sm text-ink">{name}</b>
        <span className="text-xs text-grey-mid">{note}</span>
      </span>
      <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${valueClass}`}>
        {formatCurrency(balance)}
      </span>
    </li>
  );
}

function formatDeadline(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
