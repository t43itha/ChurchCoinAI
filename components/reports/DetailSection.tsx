import React from "react";
import { ChevronDown } from "lucide-react";
import { sectionCard, sectionHead, sectionTitle } from "./classes";

export interface DetailSectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

// One collapsible block inside DetailGroup. Native details, so it works without JS state.
export const DetailSection: React.FC<DetailSectionProps> = ({ title, summary, defaultOpen = false, children }) => (
  <details open={defaultOpen} className={`group ${sectionCard}`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
      <span>{title}</span>
      <span className="flex items-center gap-2 text-right text-xs font-medium text-grey-mid">
        {summary && <span>{summary}</span>}
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="border-t border-[#efeee9] pb-2">{children}</div>
  </details>
);

export interface DetailGroupProps {
  title?: string;
  note?: string;
  children: React.ReactNode;
}

// The dashed "More detail" expander that holds the closed-by-default sections.
export const DetailGroup: React.FC<DetailGroupProps> = ({
  title = "More detail",
  note = "Closed by default · always included in PDF",
  children,
}) => (
  <section className="space-y-2 rounded-2xl border-[1.5px] border-dashed border-[#d6d3cd] p-3.5">
    <div className={`${sectionHead} px-1 py-1`}>
      <h3 className={sectionTitle}>{title}</h3>
      <span className="text-xs text-grey-mid">{note}</span>
    </div>
    {children}
  </section>
);
