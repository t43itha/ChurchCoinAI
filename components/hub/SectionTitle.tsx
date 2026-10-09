import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { linkBtn, sectionTitle } from "../wizard/ui";

export default function SectionTitle({
  children,
  link,
}: {
  children: ReactNode;
  link?: { label: string; to: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className={sectionTitle}>{children}</h2>
      {link && (
        <Link to={link.to} className={linkBtn}>
          {link.label}
        </Link>
      )}
    </div>
  );
}
