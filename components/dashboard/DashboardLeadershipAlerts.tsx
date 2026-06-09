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
      <div className="p-5 border-b border-ledger bg-paper flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-ink text-sm uppercase tracking-wide break-words">
            Leadership Alerts
          </h3>
          <p className="text-xs text-grey-mid font-medium mt-1 break-words">
            Ranked by urgency for {summary.period.label}
          </p>
        </div>
        <span className="bg-white border border-ledger rounded-full px-2 py-0.5 text-xs font-mono font-bold text-ink shrink-0">
          {alerts.length}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="p-6 flex items-start gap-3">
          <div className="p-2 rounded-lg border bg-sage-light border-sage text-sage shrink-0">
            <CheckCircle2 size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-ink text-sm">No leadership alerts</p>
            <p className="text-xs text-grey-mid mt-1 leading-snug">
              Current dashboard controls are clear for this period.
            </p>
          </div>
        </div>
      ) : (
        <ol className="divide-y divide-ledger">
          {alerts.map((alert, index) => {
            const classes = getSeverityClasses(alert.severity);
            const Icon = alert.severity === "info" ? Info : AlertTriangle;

            return (
              <li key={`${alert.severity}-${alert.title}`} className="p-5 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`p-2 rounded-lg border shrink-0 ${classes.icon}`}>
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between min-w-0">
                      <p className="font-bold text-ink text-sm break-words">
                        {index + 1}. {alert.title}
                      </p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide w-fit ${classes.badge}`}
                      >
                        {alert.severity}
                      </span>
                    </div>
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
      icon: "bg-error-light border-error text-error",
      badge: "badge-error",
    };
  }

  if (severity === "warning") {
    return {
      icon: "bg-amber-light border-amber text-amber",
      badge: "badge-warning",
    };
  }

  return {
    icon: "bg-grey-light border-ledger text-grey-mid",
    badge: "bg-grey-light text-grey-mid border border-ledger",
  };
}
