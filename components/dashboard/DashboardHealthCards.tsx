import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { formatCurrency } from "./formatters";
import type { DashboardSummaryProps, ExecutiveDashboardSummary } from "./types";

type Tone = "healthy" | "watch" | "critical" | "neutral";

// Refined Ledger tone palette: wash icon chips, mid rails, fg text tags
const toneClasses: Record<Tone, { chip: string; tag: string; value: string; rail: string }> = {
  healthy: {
    chip: "bg-sage-light text-[#6b8e6b]",
    tag: "text-[#557555]",
    value: "text-ink",
    rail: "#6b8e6b",
  },
  watch: {
    chip: "bg-amber-light text-[#c79a5f]",
    tag: "text-[#a9743f]",
    value: "text-[#a9743f]",
    rail: "#c79a5f",
  },
  critical: {
    chip: "bg-error-light text-[#c64545]",
    tag: "text-[#b53d3d]",
    value: "text-[#b53d3d]",
    rail: "#c64545",
  },
  neutral: {
    chip: "bg-[#f3f1ed] text-grey-mid",
    tag: "text-grey-mid",
    value: "text-ink",
    rail: "#d8d5ce",
  },
};

export default function DashboardHealthCards({ summary }: DashboardSummaryProps) {
  const cards = buildHealthCards(summary);

  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      aria-label="Executive dashboard health"
    >
      {cards.map(({ title, value, detail, badge, tone, icon: Icon, neutralValue }) => {
        const classes = toneClasses[tone];

        return (
          <article
            key={title}
            className="swiss-card relative bg-white overflow-hidden min-w-0 min-h-44 flex flex-col"
          >
            <span
              className="absolute left-0 top-[14px] bottom-[14px] w-[3px] rounded-r-sm"
              style={{ background: classes.rail }}
            />
            <div className="pl-[26px] pr-[22px] py-[22px] flex flex-col gap-[18px] flex-1">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${classes.chip}`}>
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span
                  className={`text-[10.5px] font-bold uppercase tracking-[0.1em] text-right leading-tight ${classes.tag}`}
                >
                  {badge}
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold text-grey-mid uppercase tracking-[0.04em]">
                  {title}
                </p>
                <p className={`mt-1.5 mb-2.5 text-[26px] 2xl:text-[30px] font-bold font-mono tabular-nums tracking-tight break-words ${neutralValue ? "text-ink" : classes.value}`}>
                  {value}
                </p>
                <p className="text-[12.5px] text-grey-mid font-medium leading-relaxed break-words">
                  {detail}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function buildHealthCards(summary: ExecutiveDashboardSummary) {
  const { health, funds, period } = summary;
  const coverageTone = health.generalFundCoverageMonths === null
    ? "neutral"
    : health.generalFundCoverageMonths >= 3
      ? "healthy"
      : health.generalFundCoverageMonths >= 1
        ? "watch"
        : "critical";
  const overdrawnCount = funds.overdrawnFunds.length;
  const periodInProgress = period.throughDate < period.endDate;

  return [
    {
      title: "Funds Held",
      value: formatCurrency(funds.generalFundBalance + funds.restrictedBalance),
      detail: `${formatCurrency(funds.generalFundBalance)} unrestricted, ${formatCurrency(funds.restrictedBalance)} restricted`,
      badge: overdrawnCount === 0 ? "In credit" : `${overdrawnCount} overdrawn`,
      tone: overdrawnCount === 0 ? "neutral" : "critical",
      icon: Landmark,
      neutralValue: true,
    },
    {
      title: "Operating Position",
      value: signedCurrency(health.netMovement),
      detail: `Unrestricted income less spending, ${period.label}${periodInProgress ? " to date" : ""}`,
      badge: health.operatingPosition,
      tone: operatingTone(health.operatingPosition),
      icon: Activity,
    },
    {
      title: "General Fund Coverage",
      value: health.generalFundCoverageMonths === null
        ? "No spend"
        : `${health.generalFundCoverageMonths.toFixed(1)} months`,
      detail: "Unrestricted balance against average monthly spending",
      badge: health.generalFundCoverageMonths === null ? "No baseline" : coverageBadge(health.generalFundCoverageMonths),
      tone: coverageTone,
      icon: ShieldCheck,
    },
    givingTrendCard(health.givingTrendPercent),
  ] satisfies Array<{
    title: string;
    value: string;
    detail: string;
    badge: string;
    tone: Tone;
    icon: typeof Activity;
    neutralValue?: boolean;
  }>;
}

function givingTrendCard(percent: number | null) {
  const detail = "Unrestricted giving per month against the prior three months";

  if (percent === null) {
    return {
      title: "Giving Trend",
      value: "No baseline",
      detail,
      badge: "Not enough history",
      tone: "neutral" as Tone,
      icon: TrendingUp,
    };
  }

  return {
    title: "Giving Trend",
    value: signedPercent(percent),
    detail,
    badge: percent >= 0 ? "Improving" : "Softening",
    tone: (percent > 0 ? "healthy" : percent < -5 ? "watch" : "neutral") as Tone,
    icon: percent >= 0 ? ArrowUpRight : ArrowDownRight,
  };
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
  return `${prefix}${formatCurrency(Math.abs(amount))}`;
}

function signedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
}
