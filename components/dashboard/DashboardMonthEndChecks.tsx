import { AlertTriangle, CheckCircle2, ChevronRight, Info, OctagonAlert } from "lucide-react";
import { Link } from "react-router-dom";
import type { MonthEndCheck, MonthEndCheckStatus } from "../../lib/dashboardChecks";

const statusStyles: Record<MonthEndCheckStatus, { chip: string; value: string; icon: typeof Info }> = {
  critical: { chip: "bg-error-light text-[#c64545]", value: "text-[#b53d3d]", icon: OctagonAlert },
  attention: { chip: "bg-amber-light text-[#c79a5f]", value: "text-[#a9743f]", icon: AlertTriangle },
  info: { chip: "bg-[#f3f1ed] text-grey-mid", value: "text-ink", icon: Info },
  clear: { chip: "bg-sage-light text-[#6b8e6b]", value: "text-ink", icon: CheckCircle2 },
};

type DashboardMonthEndChecksProps = {
  checks: MonthEndCheck[];
  periodLabel: string;
};

export default function DashboardMonthEndChecks({ checks, periodLabel }: DashboardMonthEndChecksProps) {
  const openCount = checks.filter(
    (check) => check.status === "critical" || check.status === "attention"
  ).length;

  return (
    <section className="swiss-card bg-white overflow-hidden" aria-label="Month-end checks">
      <div className="px-6 py-[18px] border-b border-[#efeee9] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em]">
            Month-End Checks
          </h3>
          <p className="text-[13.5px] text-grey-mid font-medium mt-1 break-words">
            {periodLabel}, most urgent first
          </p>
        </div>
        <span
          className={`text-[10.5px] font-bold uppercase tracking-[0.1em] shrink-0 ${
            openCount === 0 ? "text-[#557555]" : "text-[#a9743f]"
          }`}
        >
          {openCount === 0 ? "All clear" : `${openCount} to review`}
        </span>
      </div>

      <ul className="grid grid-cols-1 lg:grid-cols-2 -mb-px">
        {checks.map((check) => (
          <li key={check.id} className="border-b border-[#efeee9] lg:odd:border-r">
            {check.href ? (
              <Link
                to={check.href}
                className="group flex items-center gap-3 px-5 py-3.5 min-w-0 hover:bg-[#faf9f7] transition-colors"
              >
                <CheckRow check={check} />
                <ChevronRight
                  size={16}
                  className="text-grey-mid shrink-0 group-hover:text-ink transition-colors"
                  aria-hidden="true"
                />
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3.5 min-w-0">
                <CheckRow check={check} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckRow({ check }: { check: MonthEndCheck }) {
  const styles = statusStyles[check.status];
  const Icon = styles.icon;

  return (
    <>
      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${styles.chip}`}>
        <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink text-sm break-words">{check.label}</span>
        <span className="block text-xs text-grey-mid font-medium leading-snug break-words">
          {check.detail}
        </span>
      </span>
      <span className={`font-mono text-sm font-bold tabular-nums shrink-0 ${styles.value}`}>
        {check.value}
      </span>
    </>
  );
}
