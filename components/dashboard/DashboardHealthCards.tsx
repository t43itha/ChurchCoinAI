import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import type { DashboardSummaryProps, ExecutiveDashboardSummary } from "./types";

type Tone = "healthy" | "watch" | "critical" | "neutral";

const toneClasses: Record<Tone, { icon: string; badge: string; value: string }> = {
  healthy: {
    icon: "bg-sage-light border-sage text-sage",
    badge: "badge-success",
    value: "text-ink",
  },
  watch: {
    icon: "bg-amber-light border-amber text-amber",
    badge: "badge-warning",
    value: "text-ink",
  },
  critical: {
    icon: "bg-error-light border-error text-error",
    badge: "badge-error",
    value: "text-error",
  },
  neutral: {
    icon: "bg-grey-light border-ledger text-grey-mid",
    badge: "bg-grey-light text-grey-mid border border-ledger",
    value: "text-ink",
  },
};

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function DashboardHealthCards({ summary }: DashboardSummaryProps) {
  const cards = buildHealthCards(summary);

  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      aria-label="Executive dashboard health"
    >
      {cards.map(({ title, value, detail, badge, tone, icon: Icon }) => {
        const classes = toneClasses[tone];

        return (
          <article
            key={title}
            className="swiss-card bg-white p-5 min-w-0 min-h-40 flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className={`p-2 rounded-lg border shrink-0 ${classes.icon}`}>
                <Icon size={20} aria-hidden="true" />
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide text-right leading-tight ${classes.badge}`}
              >
                {badge}
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">
                {title}
              </p>
              <p className={`mt-1 text-2xl font-bold tracking-tight break-words ${classes.value}`}>
                {value}
              </p>
              <p className="mt-2 text-xs text-grey-mid font-medium leading-snug break-words">
                {detail}
              </p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function buildHealthCards(summary: ExecutiveDashboardSummary) {
  const { health } = summary;
  const givingTrendTone = health.givingTrendPercent > 0
    ? "healthy"
    : health.givingTrendPercent < -5
      ? "watch"
      : "neutral";
  const coverageTone = health.generalFundCoverageMonths === null
    ? "neutral"
    : health.generalFundCoverageMonths >= 3
      ? "healthy"
      : health.generalFundCoverageMonths >= 1
        ? "watch"
        : "critical";
  const donorTone = health.donorAttentionCount === 0
    ? "healthy"
    : health.donorAttentionCount <= 3
      ? "watch"
      : "critical";

  return [
    {
      title: "Operating Position",
      value: signedCurrency(health.netMovement),
      detail: `${summary.period.label} net movement`,
      badge: health.operatingPosition,
      tone: operatingTone(health.operatingPosition),
      icon: Activity,
    },
    {
      title: "Giving Trend",
      value: signedPercent(health.givingTrendPercent),
      detail: "Unrestricted giving versus recent baseline",
      badge: health.givingTrendPercent >= 0 ? "Improving" : "Softening",
      tone: givingTrendTone,
      icon: health.givingTrendPercent >= 0 ? ArrowUpRight : ArrowDownRight,
    },
    {
      title: "General Fund Coverage",
      value: health.generalFundCoverageMonths === null
        ? "No spend"
        : `${health.generalFundCoverageMonths.toFixed(1)} months`,
      detail: "Coverage from average unrestricted expenditure",
      badge: health.generalFundCoverageMonths === null ? "No baseline" : coverageBadge(health.generalFundCoverageMonths),
      tone: coverageTone,
      icon: ShieldCheck,
    },
    {
      title: "Donor Attention",
      value: health.donorAttentionCount.toLocaleString("en-GB"),
      detail: "Pledges, Gift Aid, or giving records needing review",
      badge: health.donorAttentionCount === 0 ? "Clear" : "Review",
      tone: donorTone,
      icon: health.donorAttentionCount === 0 ? TrendingUp : UsersRound,
    },
  ] satisfies Array<{
    title: string;
    value: string;
    detail: string;
    badge: string;
    tone: Tone;
    icon: typeof Activity;
  }>;
}

function operatingTone(position: ExecutiveDashboardSummary["health"]["operatingPosition"]): Tone {
  if (position === "Healthy") {
    return "healthy";
  }

  if (position === "Watch") {
    return "watch";
  }

  return "critical";
}

function coverageBadge(months: number) {
  if (months >= 3) {
    return "Resilient";
  }

  if (months >= 1) {
    return "Watch";
  }

  return "Low";
}

function signedCurrency(amount: number) {
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${prefix}${currencyFormatter.format(Math.abs(amount))}`;
}

function signedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
}
