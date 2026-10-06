import type { ReactNode } from "react";
import { ChevronRight, OctagonAlert, PiggyBank, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "./formatters";
import type { DashboardSummaryProps } from "./types";

export default function DashboardFundHealth({ summary }: DashboardSummaryProps) {
  const { campaigns, overdrawnFunds, lowBalanceFunds } = summary.funds;

  return (
    <section className="swiss-card bg-white overflow-hidden" aria-label="Fund health">
      <div className="px-6 py-[18px] border-b border-[#efeee9]">
        <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em]">
          Fund Health
        </h3>
        <p className="text-[13.5px] text-grey-mid font-medium mt-1">
          Overdrawn funds, open campaigns, and low balances
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[#efeee9]">
        <FundList
            title="Overdrawn"
            icon={<OctagonAlert size={18} strokeWidth={1.9} className="text-[#c64545] shrink-0" aria-hidden="true" />}
            funds={overdrawnFunds}
            valueClassName="text-[#b53d3d]"
            emptyMessage="No fund is below zero."
          />

        <div className="p-5 md:px-6 min-w-0 bg-white">
          <SectionHeading
            title="Open Campaigns"
            count={campaigns.length}
            icon={<Target size={18} strokeWidth={1.9} className="text-[#c79a5f] shrink-0" aria-hidden="true" />}
          />
          {campaigns.length === 0 ? (
            <p className="text-sm text-grey-mid font-medium">
              No open campaigns. Give a fund a target to track it here.
            </p>
          ) : (
            <ul className="space-y-4">
              {campaigns.map((campaign) => (
                <li key={campaign.fundId} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 min-w-0">
                    <span className="font-bold text-ink text-sm break-words min-w-0">{campaign.name}</span>
                    <span className="font-mono text-sm font-bold text-amber-dark shrink-0 tabular-nums">
                      {campaign.progressPercent}%
                    </span>
                  </div>
                  <div className="mt-2 h-[7px] bg-[#eceae5] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#c79a5f]"
                      style={{ width: `${clampPercent(campaign.progressPercent)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs font-medium text-grey-mid">
                    <span>
                      {formatCurrency(campaign.balance)} of {formatCurrency(campaign.targetAmount)}
                    </span>
                    {campaign.deadline ? <span>Due {formatDeadline(campaign.deadline)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FundList
            title="Low Balance"
            icon={<PiggyBank size={18} strokeWidth={1.9} className="text-grey-mid shrink-0" aria-hidden="true" />}
            funds={lowBalanceFunds}
            valueClassName="text-amber-dark"
            emptyMessage="No fund is under £1,000."
          />
      </div>

      <Link
        to="/funds"
        className="px-6 py-3 border-t border-[#efeee9] flex items-center justify-between text-xs font-bold uppercase tracking-[0.08em] text-grey-mid hover:text-ink hover:bg-[#faf9f7] transition-colors"
      >
        Open funds
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}

function SectionHeading({ title, count, icon }: { title: string; count: number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 min-w-0">
      {icon}
      <h4 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em] break-words">{title}</h4>
      <span className="font-mono text-[12.5px] font-bold text-grey-mid shrink-0">{count}</span>
    </div>
  );
}

function FundList({
  title,
  icon,
  funds,
  valueClassName,
  emptyMessage,
}: {
  title: string;
  icon: ReactNode;
  funds: Array<{ fundId: string; name: string; balance: number }>;
  valueClassName: string;
  emptyMessage: string;
}) {
  return (
    <div className="p-5 md:px-6 min-w-0 bg-white">
      <SectionHeading title={title} count={funds.length} icon={icon} />
      {funds.length === 0 ? (
        <p className="text-sm text-grey-mid font-medium">{emptyMessage}</p>
      ) : (
        <ul className="ledger-divide-y ledger-divide-[#efeee9] border-y border-[#efeee9]">
          {funds.map((fund) => (
            <li key={fund.fundId} className="py-2.5 flex items-center justify-between gap-3 min-w-0">
              <span className="font-bold text-ink text-sm break-words min-w-0">{fund.name}</span>
              <span className={`font-mono text-sm font-bold shrink-0 tabular-nums ${valueClassName}`}>
                {formatCurrency(fund.balance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
