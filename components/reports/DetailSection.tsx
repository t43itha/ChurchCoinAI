import React from "react";
import { ChevronDown } from "lucide-react";

export interface DetailSectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

// One collapsible block inside DetailGroup. Native details, so it works without JS state.
export const DetailSection: React.FC<DetailSectionProps> = ({ title, summary, defaultOpen = false, children }) => (
  <details open={defaultOpen} className="group border-t border-[#efeee9]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
      <span>{title}</span>
      <span className="flex items-center gap-2 text-right text-xs font-medium text-grey-mid">
        {summary && <span>{summary}</span>}
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="px-[18px] pb-4">{children}</div>
  </details>
);

export interface DetailGroupProps {
  title?: string;
  note?: string;
  children: React.ReactNode;
}

// Card wrapping the closed-by-default detail sections.
export const DetailGroup: React.FC<DetailGroupProps> = ({
  title = "More detail",
  note = "Closed by default · always included in PDF",
  children,
}) => (
  <section className="swiss-card-static">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-[18px] py-3.5">
      <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
      <span className="text-[12.5px] text-grey-mid">{note}</span>
    </div>
    {children}
  </section>
);
