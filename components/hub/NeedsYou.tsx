import { Children, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { nextIcon, nextItem } from "../wizard/ui";

export type NeedsYouTone = "amber" | "sage" | "grey";

const toneClasses: Record<NeedsYouTone, string> = {
  amber: "bg-amber-light text-amber",
  sage: "bg-sage-light text-sage",
  grey: "bg-grey-light text-grey-dark",
};

// The hub's "Needs you" list. An empty list says so in sage rather than hiding the section.
export function NeedsYou({ children, emptyText = "You're up to date." }: { children?: ReactNode; emptyText?: string }) {
  if (Children.toArray(children).length === 0) {
    return (
      <p className="rounded-2xl border border-ledger bg-white px-4 py-3.5 text-sm font-semibold text-sage">{emptyText}</p>
    );
  }
  return <div className="grid gap-2">{children}</div>;
}

interface NeedsYouItemProps {
  tone: NeedsYouTone;
  icon: LucideIcon;
  title: string;
  detail?: string;
  // A small label replaces the chevron, e.g. "Start".
  action?: string;
  // Pass href to open a page, or onClick for an action. With neither the row is static.
  href?: string;
  onClick?: () => void;
}

export function NeedsYouItem({ tone, icon: Icon, title, detail, action, href, onClick }: NeedsYouItemProps) {
  const body = (
    <>
      <span className={`${nextIcon} ${toneClasses[tone]}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[14.5px] text-ink">{title}</b>
        {detail && <span className="block text-xs text-grey-mid">{detail}</span>}
      </span>
      {action ? (
        <span className="shrink-0 rounded-xl border border-ledger bg-white px-3 py-2 text-sm font-semibold text-ink">
          {action}
        </span>
      ) : (
        <ChevronRight size={18} className="shrink-0 text-grey-mid" aria-hidden="true" />
      )}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={nextItem}>
        {body}
      </Link>
    );
  }
  if (!onClick) {
    return <div className={nextItem}>{body}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={nextItem}>
      {body}
    </button>
  );
}
