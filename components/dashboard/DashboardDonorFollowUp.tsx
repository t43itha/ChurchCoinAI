import { ChevronRight, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "./formatters";
import type { DashboardSummaryProps } from "./types";

type DashboardDonorFollowUpProps = DashboardSummaryProps & {
  canOpenDonors: boolean;
};

export default function DashboardDonorFollowUp({ summary, canOpenDonors }: DashboardDonorFollowUpProps) {
  const { missedGiftAidCount, missedGiftAidValue, pledgesBehindCount } = summary.donorFollowUp;
  const rows = [
    ...(missedGiftAidCount === null
      ? []
      : [
          {
            label: "Gifts missing Gift Aid",
            value: missedGiftAidCount,
            detail:
              missedGiftAidCount === 0
                ? "Every gift from a declared donor is marked eligible"
                : `${formatCurrency(missedGiftAidValue ?? 0)} reclaimable once marked eligible`,
          },
        ]),
    {
      label: "Pledges behind",
      value: pledgesBehindCount,
      detail: "Recurring pledges with no payment in their usual interval",
    },
  ];

  return (
    <section className="swiss-card bg-white overflow-hidden h-full flex flex-col" aria-label="Donor follow-up">
      <div className="px-6 py-[18px] border-b border-[#efeee9] flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-lg bg-amber-light text-[#c79a5f] shrink-0">
          <UsersRound size={18} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em]">
            Donor Follow-Up
          </h3>
          <p className="text-[13.5px] text-grey-mid font-medium mt-1 leading-snug">
            Counts only. Donor names stay out of this view.
          </p>
        </div>
      </div>

      <div className="ledger-divide-y ledger-divide-[#efeee9] flex-1">
        {rows.map((row) => (
          <div key={row.label} className="px-6 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-bold text-ink text-sm">{row.label}</p>
              <p className="text-xs text-grey-mid font-medium leading-snug mt-0.5">{row.detail}</p>
            </div>
            <p
              className={`font-mono text-2xl font-bold tabular-nums leading-none shrink-0 ${
                row.value === 0 ? "text-ink" : "text-[#a9743f]"
              }`}
            >
              {row.value.toLocaleString("en-GB")}
            </p>
          </div>
        ))}
      </div>

      {canOpenDonors ? (
        <Link
          to="/donors"
          className="px-6 py-3 border-t border-[#efeee9] flex items-center justify-between text-xs font-bold uppercase tracking-[0.08em] text-grey-mid hover:text-ink hover:bg-[#faf9f7] transition-colors"
        >
          Open donors
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}
