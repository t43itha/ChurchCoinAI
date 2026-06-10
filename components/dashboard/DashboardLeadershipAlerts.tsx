import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { DashboardSummaryProps, ExecutiveDashboardSummary } from "./types";

const severityRank: Record<ExecutiveDashboardSummary["alerts"][number]["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export default function DashboardLeadershipAlerts({ summary }: DashboardSummaryProps) {
  const alerts = [...summary.alerts].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  );

  return (
    <section className="swiss-card bg-white overflow-hidden" aria-label="Leadership alerts">
      <div className="px-6 py-[18px] border-b border-[#efeee9] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em] break-words">
            Leadership Alerts
          </h3>
          <p className="text-[13.5px] text-grey-mid font-medium mt-1 break-words">
            Ranked by urgency for {summary.period.label}
          </p>
        </div>
        <span className="font-mono text-[12.5px] font-bold text-grey-mid shrink-0">
          {alerts.length}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="p-6 flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-lg bg-sage-light text-[#6b8e6b] shrink-0">
            <CheckCircle2 size={18} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-ink text-sm">No leadership alerts</p>
            <p className="text-xs text-grey-mid mt-1 leading-snug">
              Current dashboard controls are clear for this period.
            </p>
          </div>
        </div>
      ) : (
        <ol className="divide-y divide-[#efeee9]">
          {alerts.map((alert, index) => {
            const classes = getSeverityClasses(alert.severity);
            const Icon = alert.severity === "info" ? Info : AlertTriangle;

            return (
              <li key={`${alert.severity}-${alert.title}`} className="p-5 min-w-0 bg-white">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`inline-flex items-center justify-center w-[38px] h-[38px] rounded-lg shrink-0 ${classes.chip}`}>
                    <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between min-w-0">
                      <p className="font-bold text-ink text-sm break-words">
                        {index + 1}. {alert.title}
                      </p>
                      <span
                        className={`text-[10.5px] font-bold uppercase tracking-[0.1em] w-fit ${classes.tag}`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-grey-mid font-medium leading-snug">
                      Review this before sharing the month-end position with trustees or ministry leads.
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function getSeverityClasses(severity: ExecutiveDashboardSummary["alerts"][number]["severity"]) {
  if (severity === "critical") {
    return {
      chip: "bg-error-light text-[#c64545]",
      tag: "text-[#b53d3d]",
    };
  }

  if (severity === "warning") {
    return {
      chip: "bg-amber-light text-[#c79a5f]",
      tag: "text-[#a9743f]",
    };
  }

  return {
    chip: "bg-[#f3f1ed] text-grey-mid",
    tag: "text-grey-mid",
  };
}
