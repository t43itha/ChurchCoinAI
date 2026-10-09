import React from "react";
import { Link } from "react-router-dom";
import { nextIcon, nextItem } from "../wizard/ui";
import { btnOutlineSm, sectionCard, sectionHead, sectionTitle } from "./classes";

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
  pay: { glyph: "£", className: "bg-grey-light text-grey-dark" },
  claim: { glyph: "↺", className: "bg-sage-light text-sage" },
  info: { glyph: "⌛", className: "bg-grey-light text-grey-mid" },
  warn: { glyph: "!", className: "bg-amber-light text-amber" },
};

const ActionButton: React.FC<{ href: string; label: string }> = ({ href, label }) =>
  href.startsWith("/") ? (
    <Link to={href} className={btnOutlineSm}>
      {label}
    </Link>
  ) : (
    <a href={href} className={btnOutlineSm}>
      {label}
    </a>
  );

// "To action": the things that need doing before the numbers are final.
export const ActionList: React.FC<ActionListProps> = ({ items, title = "To action this month" }) => (
  <section className={sectionCard}>
    <div className={sectionHead}>
      <h3 className={sectionTitle}>{title}</h3>
      {items.length > 0 && (
        <span className="text-xs text-grey-mid">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      )}
    </div>
    {items.length === 0 ? (
      <p className="px-[18px] pb-4 text-sm font-semibold text-sage">You're up to date</p>
    ) : (
      <ul className="space-y-2 p-3">
        {items.map((item) => {
          const tile = TILE[item.tone];
          return (
            <li key={item.id} className={nextItem}>
              <span aria-hidden="true" className={`${nextIcon} text-base font-bold ${tile.className}`}>
                {tile.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {item.detail && <p className="text-xs text-grey-mid">{item.detail}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {item.amount && <span className="font-mono text-sm font-semibold text-ink">{item.amount}</span>}
                {item.href && <ActionButton href={item.href} label={item.linkLabel ?? "Open"} />}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
