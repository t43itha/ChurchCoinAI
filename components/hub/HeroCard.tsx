import type { ReactNode } from "react";
import { darkCard } from "../wizard/ui";

export interface HeroSegment {
  label: string;
  // Pre-formatted for the legend.
  value: string;
  // Sets the segment's share of the bar. Negative amounts show as empty.
  amount: number;
  colour: string;
}

// The one number a hub is about, on the dark card. Optional segments draw a split bar with a legend.
export default function HeroCard({
  label,
  value,
  sub,
  segments,
  children,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  segments?: HeroSegment[];
  children?: ReactNode;
}) {
  const total = (segments ?? []).reduce((sum, segment) => sum + Math.max(0, segment.amount), 0);

  return (
    <section className={darkCard} aria-label={label}>
      <p className="text-sm font-semibold text-white/70">{label}</p>
      <p className="mt-1 font-mono text-[30px] font-bold leading-tight tracking-tight tabular-nums md:text-[36px]">
        {value}
      </p>
      {sub && <div className="mt-2 text-sm text-white/80">{sub}</div>}

      {segments && (
        <>
          <div className="mt-4 flex h-2.5 gap-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            {total > 0 &&
              segments.map((segment) => (
                <span
                  key={segment.label}
                  className="rounded-full"
                  style={{
                    flexBasis: 0,
                    flexGrow: Math.max(0, segment.amount),
                    background: segment.colour,
                  }}
                />
              ))}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-white/80">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: segment.colour }} aria-hidden="true" />
                  {segment.label}
                </dt>
                <dd className="font-mono font-semibold tabular-nums">{segment.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {children}
    </section>
  );
}
