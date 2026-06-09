import { PiggyBank, Target, WalletCards } from "lucide-react";
import type { DashboardSummaryProps } from "./types";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function DashboardFundHealth({ summary }: DashboardSummaryProps) {
  const { funds } = summary;
  const campaign = funds.campaignProgress;

  return (
    <section className="swiss-card bg-white overflow-hidden" aria-label="Fund health">
      <div className="p-5 border-b border-ledger bg-paper">
        <h3 className="font-bold text-ink text-sm uppercase tracking-wide">
          Fund Health
        </h3>
        <p className="text-xs text-grey-mid font-medium mt-1">
          General fund, campaign progress, and low-balance funds
        </p>
      </div>

      <div className="divide-y divide-ledger">
        <div className="p-5 flex items-start gap-4 min-w-0">
          <div className="p-2 rounded-lg border bg-sage-light border-sage text-sage shrink-0">
            <WalletCards size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">
              General Fund Balance
            </p>
            <p className="mt-1 text-2xl font-bold text-ink font-mono break-words">
              {currencyFormatter.format(funds.generalFundBalance)}
            </p>
          </div>
        </div>

        <div className="p-5 min-w-0">
          <div className="flex items-start gap-4 min-w-0">
            <div className="p-2 rounded-lg border bg-amber-light border-amber text-amber shrink-0">
              <Target size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">
                    Campaign Progress
                  </p>
                  <p className="mt-1 font-bold text-ink break-words">
                    {campaign?.name ?? "No active campaign target"}
                  </p>
                </div>
                {campaign ? (
                  <span className="font-mono text-sm font-bold text-amber-dark shrink-0">
                    {Math.round(campaign.progressPercent)}%
                  </span>
                ) : null}
              </div>

              {campaign ? (
                <div className="mt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs font-bold text-grey-mid">
                    <span className="break-words">
                      {currencyFormatter.format(campaign.balance)} raised
                    </span>
                    <span className="break-words">
                      Target {currencyFormatter.format(campaign.targetAmount)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-grey-light rounded-full overflow-hidden border border-ledger">
                    <div
                      className="h-full bg-amber"
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

        <div className="p-5 min-w-0">
          <div className="flex items-center gap-2 mb-4 min-w-0">
            <PiggyBank size={18} className="text-grey-mid shrink-0" aria-hidden="true" />
            <h4 className="font-bold text-ink text-sm uppercase tracking-wide break-words">
              Low-Balance Funds
            </h4>
            <span className="bg-grey-light border border-ledger rounded-full px-2 py-0.5 text-[10px] font-mono font-bold text-grey-mid shrink-0">
              {funds.lowBalanceFunds.length}
            </span>
          </div>

          {funds.lowBalanceFunds.length === 0 ? (
            <p className="text-sm text-grey-mid font-medium">
              No low-balance funds for this period.
            </p>
          ) : (
            <div className="divide-y divide-ledger border-y border-ledger">
              {funds.lowBalanceFunds.map((fund) => (
                <div
                  key={fund.fundId}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 min-w-0"
                >
                  <span className="font-bold text-ink text-sm break-words min-w-0">
                    {fund.name}
                  </span>
                  <span className="font-mono text-sm font-bold text-amber-dark shrink-0">
                    {currencyFormatter.format(fund.balance)}
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
