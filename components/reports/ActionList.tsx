import React from "react";
import { Link } from "react-router-dom";

export type ActionTone = "pay" | "claim" | "info" | "warn";

export interface ActionItem {
  id: string;
  tone: ActionTone;
  title: string;
  detail?: string;
  amount?: string;
  href?: string;
  linkLabel?: string;
}

export interface ActionListProps {
  items: ActionItem[];
  title?: string;
}

const TILE: Record<ActionTone, { glyph: string; className: string }> = {
  pay: { glyph: "£", className: "bg-amber-light text-amber" },
  claim: { glyph: "↺", className: "bg-sage-light text-sage" },
  info: { glyph: "⌛", className: "bg-grey-light text-grey-dark" },
  warn: { glyph: "!", className: "bg-error-light text-error" },
};

const ActionLink: React.FC<{ href: string; label: string }> = ({ href, label }) => {
  const linkClass = "text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline";
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={linkClass}>
        {label} ›
      </Link>
    );
  }
  return (
    <a href={href} className={linkClass}>
      {label} ›
    </a>
  );
};

export const ActionList: React.FC<ActionListProps> = ({ items, title = "To action this month" }) => (
  <section className="swiss-card-static">
    <div className="flex items-center justify-between border-b border-[#efeee9] px-[18px] py-3.5">
      <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
      <span className="text-[12.5px] text-grey-mid">
        {items.length} {items.length === 1 ? "item" : "items"}
      </span>
    </div>
    {items.length === 0 ? (
      <p className="px-[18px] py-4 text-sm text-grey-mid">Nothing to action</p>
    ) : (
      <ul className="grid grid-cols-1 md:grid-cols-2">
        {items.map((item) => {
          const tile = TILE[item.tone];
          return (
            <li
              key={item.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-[#efeee9] px-[18px] py-[11px] text-sm md:odd:border-r"
            >
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${tile.className}`}
              >
                {tile.glyph}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink">{item.title}</p>
                {item.detail && <p className="text-[12.5px] text-grey-mid">{item.detail}</p>}
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                {item.amount && <span className="font-mono text-sm font-semibold text-ink">{item.amount}</span>}
                {item.href && <ActionLink href={item.href} label={item.linkLabel ?? "Open"} />}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
