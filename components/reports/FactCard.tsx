import React from "react";
import { sectionCard, sectionHead, sectionTitle } from "./classes";

export interface FactRow {
  label: string;
  value: string;
  tone?: "default" | "warning";
}

export interface FactCardProps {
  title: string;
  rows: FactRow[];
  note?: string;
}

const VALUE_TONE: Record<NonNullable<FactRow["tone"]>, string> = {
  default: "text-ink",
  warning: "text-amber",
};

// A titled list of label / value lines with an optional note underneath.
export const FactCard: React.FC<FactCardProps> = ({ title, rows, note }) => (
  <section className={sectionCard}>
    <div className={sectionHead}>
      <h3 className={sectionTitle}>{title}</h3>
    </div>
    <dl className="divide-y divide-[#efeee9] border-t border-[#efeee9] px-[18px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
          <dt className="text-grey-dark">{row.label}</dt>
          <dd className={`font-mono font-semibold ${VALUE_TONE[row.tone ?? "default"]}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
    {note && (
      <p className="m-[18px] rounded-xl bg-grey-light px-3.5 py-2.5 text-xs leading-relaxed text-grey-dark">{note}</p>
    )}
  </section>
);
