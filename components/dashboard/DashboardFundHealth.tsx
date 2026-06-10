import { PiggyBank, Target, WalletCards } from "lucide-react";
import { formatCurrency } from "./formatters";
import type { DashboardSummaryProps } from "./types";

export default function DashboardFundHealth({ summary }: DashboardSummaryProps) {
  const { funds } = summary;
  const campaign = funds.campaignProgress;

  return (
    <section className="swiss-card bg-white overflow-hidden" aria-label="Fund health">
      <div className="px-6 py-[18px] border-b border-[#efeee9] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em]">
            Fund Health
          </h3>
          <p className="text-[13.5px] text-grey-mid font-medium mt-1">
            General fund, campaign progress, and low-balance funds
          </p>
        </div>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-grey-mid w-fit">
          {funds.lowBalanceFunds.length} low
        </span>
      </div>

      <div className="divide-y divide-[#efeee9]">
        <div className="p-5 md:px-6 flex items-start gap-4 min-w-0">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-sage-light text-[#6b8e6b] shrink-0">
            <WalletCards size={20} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold text-grey-mid uppercase tracking-[0.04em]">
              General Fund Balance
            </p>
            <p className="mt-1 text-3xl font-bold text-ink font-mono tabular-nums break-words tracking-tight">
              {formatCurrency(funds.generalFundBalance)}
            </p>
          </div>
        </div>

        <div className="p-5 md:px-6 min-w-0">
          <div className="flex items-start gap-4 min-w-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-amber-light text-[#c79a5f] shrink-0">
              <Target size={20} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold text-grey-mid uppercase tracking-[0.04em]">
                    Campaign Progress
                  </p>
                  <p className="mt-1 font-bold text-ink break-words">
                    {campaign?.name ?? "No active campaign target"}
                  </p>
                </div>
                {campaign ? (
                  <span className="font-mono text-sm font-bold text-amber-dark shrink-0 tabular-nums">
                    {Math.round(campaign.progressPercent)}%
                  </span>
                ) : null}
              </div>

              {campaign ? (
                <div className="mt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-bold text-grey-mid">
                    <span className="break-words">
                      {formatCurrency(campaign.balance)} raised
                    </span>
                    <span className="break-words">
                      Target {formatCurrency(campaign.targetAmount)}
                    </span>
                  </div>
                  <div className="mt-2 h-[7px] bg-[#eceae5] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#c79a5f]"
                      style={{ width: `${clampPercent(campaign.progressPercent)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-grey-mid leading-snug">
                  Add a fund target to surface campaign progress here.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 md:px-6 min-w-0">
          <div className="flex items-center gap-2 mb-4 min-w-0">
            <PiggyBank size={18} strokeWidth={1.9} className="text-grey-mid shrink-0" aria-hidden="true" />
            <h4 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em] break-words">
              Low-Balance Funds
            </h4>
            <span className="font-mono text-[12.5px] font-bold text-grey-mid shrink-0">
              {funds.lowBalanceFunds.length}
            </span>
          </div>

          {funds.lowBalanceFunds.length === 0 ? (
            <p className="text-sm text-grey-mid font-medium">
              No low-balance funds for this period.
            </p>
          ) : (
            <div className="divide-y divide-[#efeee9] border-y border-[#efeee9]">
              {funds.lowBalanceFunds.map((fund) => (
                <div
                  key={fund.fundId}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 min-w-0"
                >
                  <span className="font-bold text-ink text-sm break-words min-w-0">
                    {fund.name}
                  </span>
                  <span className="font-mono text-sm font-bold text-amber-dark shrink-0 tabular-nums">
                    {formatCurrency(fund.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
