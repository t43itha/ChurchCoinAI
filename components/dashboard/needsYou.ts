import { AlertTriangle, Gift, Info, OctagonAlert, UsersRound, type LucideIcon } from "lucide-react";
import { buildMonthEndChecks } from "../../lib/dashboardChecks";
import type { ExecutiveDashboardSummary } from "../../lib/dashboardKpis";
import type { UserRole } from "../../lib/permissions";
import type { NeedsYouTone } from "../hub/NeedsYou";
import { formatCurrency } from "./formatters";

export interface DashboardNeedsYouRow {
  id: string;
  tone: NeedsYouTone;
  icon: LucideIcon;
  title: string;
  detail: string;
  // The figure, shown where the chevron would be.
  action: string;
  href?: string;
}

const STATUS_ROW = {
  critical: { tone: "amber", icon: OctagonAlert },
  attention: { tone: "amber", icon: AlertTriangle },
  info: { tone: "grey", icon: Info },
} as const satisfies Record<string, { tone: NeedsYouTone; icon: LucideIcon }>;

// Month-end checks that need a look, then donor follow-up. Clear checks and zero counts
// are left out, so an empty list means nothing is due.
export function buildDashboardNeedsYou(
  summary: ExecutiveDashboardSummary,
  { role, bankFeedIssues, canOpenDonors }: { role: UserRole; bankFeedIssues: number; canOpenDonors: boolean }
): DashboardNeedsYouRow[] {
  const checks = buildMonthEndChecks(summary, { role, bankFeedIssues }).flatMap((check): DashboardNeedsYouRow[] =>
    check.status === "clear"
      ? []
      : [
          {
            id: check.id,
            ...STATUS_ROW[check.status],
            title: check.label,
            detail: check.detail,
            action: check.value,
            href: check.href,
          },
        ]
  );

  const { missedGiftAidCount, missedGiftAidValue, pledgesBehindCount } = summary.donorFollowUp;
  const donorHref = canOpenDonors ? "/donors" : undefined;
  const donorRows: DashboardNeedsYouRow[] = [
    ...(missedGiftAidCount !== null && missedGiftAidCount > 0
      ? [
          {
            id: "missed-gift-aid",
            tone: "amber" as const,
            icon: Gift,
            title: "Gifts missing Gift Aid",
            detail: `${formatCurrency(missedGiftAidValue ?? 0)} reclaimable once marked eligible`,
            action: missedGiftAidCount.toLocaleString("en-GB"),
            href: donorHref,
          },
        ]
      : []),
    ...(pledgesBehindCount > 0
      ? [
          {
            id: "pledges-behind",
            tone: "amber" as const,
            icon: UsersRound,
            title: "Pledges behind",
            detail: "Recurring pledges with no payment in their usual interval",
            action: pledgesBehindCount.toLocaleString("en-GB"),
            href: donorHref,
          },
        ]
      : []),
  ];

  return [...checks, ...donorRows];
}
