import React from "react";
import type { Headline, HeadlineTone } from "../../lib/reportHeadline";

export interface ReportHeadlineProps {
  eyebrow: string;
  headline: Headline;
}

const LEAD_CLASS: Record<HeadlineTone, string> = {
  surplus: "font-semibold text-sage",
  deficit: "font-semibold text-error",
  breakeven: "font-semibold text-ink",
};

const PILL_CLASS: Record<HeadlineTone, string> = {
  surplus: "bg-sage-light text-sage",
  deficit: "bg-error-light text-error",
  breakeven: "bg-grey-light text-grey-dark",
};

export const ReportHeadline: React.FC<ReportHeadlineProps> = ({ eyebrow, headline }) => (
  <section className="swiss-card-static flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between md:p-6">
    <div className="min-w-0">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-grey-mid">{eyebrow}</p>
      <p className="mt-2 text-[21px] font-semibold leading-snug text-ink">
        <span className={LEAD_CLASS[headline.tone]}>{headline.lead}</span>
        {headline.rest}
      </p>
    </div>
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[12.5px] font-bold ${PILL_CLASS[headline.tone]}`}
    >
      <span aria-hidden="true">●</span>
      {headline.status}
    </span>
  </section>
);
