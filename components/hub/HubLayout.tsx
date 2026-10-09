import type { ReactNode } from "react";

// The page column, with the receipt column beside it on xl. Below xl the receipt
// folds under the page.
export default function HubLayout({ children, receipt }: { children: ReactNode; receipt?: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <div className="min-w-0 space-y-6">{children}</div>
      {receipt && <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">{receipt}</aside>}
    </div>
  );
}
