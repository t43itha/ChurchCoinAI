import type { ReactNode } from "react";
import { eyebrow as eyebrowClass, hubTitle } from "../wizard/ui";

// Page header for a hub: the date or context, the period as the title, a one-line
// status and the page's actions. Actions sit to the right on desktop and wrap below on phones.
export default function HubHeader({
  eyebrow,
  title,
  status,
  actions,
}: {
  eyebrow?: string;
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
        <h1 className={`${hubTitle} mt-1.5`}>{title}</h1>
        {status && <p className="mt-1.5 text-sm text-grey-mid">{status}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </header>
  );
}
