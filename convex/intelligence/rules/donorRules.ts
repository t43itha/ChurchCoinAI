import { Doc, Id } from "../../_generated/dataModel";

export interface DonorRuleContext {
  donor: Doc<"donors">;
  transactions: Doc<"transactions">[];
  pledges: Doc<"pledges">[];
  daysSinceLastGift: number;
  avgGiftFrequencyDays: number | null;
  totalGiving: number;
  ytdGiving: number;
  prevYtdGiving: number;
  giftCount: number;
  uniqueFunds: number;
  firstGiftDate: string | null;
  church90thPercentile: number;
}

export interface InsightResult {
  description: string;
  confidence: number;
  suggestedAction?: string;
  actionUrl?: string;
  actionData?: Record<string, unknown>;
}

export interface DonorInsightRule {
  id: string;
  title: string;
  insightType: "donor";
  severity: "info" | "warning" | "critical";
  evaluate: (context: DonorRuleContext) => InsightResult | null;
}

export const DONOR_RULES: DonorInsightRule[] = [
  {
    id: "lapsed_regular_donor",
    title: "Regular donor hasn't given recently",
    insightType: "donor",
    severity: "warning",
    evaluate: (ctx) => {
      if (
        ctx.avgGiftFrequencyDays &&
        ctx.avgGiftFrequencyDays < 45 &&
        ctx.daysSinceLastGift > 60
      ) {
        return {
          description: `${ctx.donor.name} typically gives every ${Math.round(ctx.avgGiftFrequencyDays)} days but hasn't given in ${ctx.daysSinceLastGift} days.`,
          confidence: 0.85,
          suggestedAction: "Send a gentle check-in message",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id },
        };
      }
      return null;
    },
  },
  {
    id: "declining_gift_amount",
    title: "Donor's giving has declined significantly",
    insightType: "donor",
    severity: "warning",
    evaluate: (ctx) => {
      if (ctx.prevYtdGiving > 100 && ctx.ytdGiving < ctx.prevYtdGiving * 0.7) {
        const decline = Math.round(
          (1 - ctx.ytdGiving / ctx.prevYtdGiving) * 100
        );
        return {
          description: `${ctx.donor.name}'s giving is down ${decline}% compared to last year (£${ctx.ytdGiving.toLocaleString()} vs £${ctx.prevYtdGiving.toLocaleString()}).`,
          confidence: 0.8,
          suggestedAction: "Review donor relationship",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id },
        };
      }
      return null;
    },
  },
  {
    id: "high_potential_new_donor",
    title: "New donor showing high engagement",
    insightType: "donor",
    severity: "info",
    evaluate: (ctx) => {
      if (!ctx.firstGiftDate) return null;
      const daysSinceFirst = Math.floor(
        (Date.now() - new Date(ctx.firstGiftDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (daysSinceFirst <= 90 && ctx.giftCount >= 3) {
        return {
          description: `${ctx.donor.name} is a new donor who has given ${ctx.giftCount} times in their first 3 months!`,
          confidence: 0.9,
          suggestedAction: "Send a thank-you note and welcome pack",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id },
        };
      }
      return null;
    },
  },
  {
    id: "gift_aid_eligible_not_signed",
    title: "Active donor without Gift Aid declaration",
    insightType: "donor",
    severity: "warning",
    evaluate: (ctx) => {
      if (
        !ctx.donor.isGiftAidActive &&
        ctx.ytdGiving > 100 &&
        ctx.donor.type === "Individual"
      ) {
        const potential = Math.round(ctx.ytdGiving * 0.25);
        return {
          description: `${ctx.donor.name} has given £${ctx.ytdGiving.toLocaleString()} this year but hasn't signed a Gift Aid declaration. Potential claim: £${potential}.`,
          confidence: 0.95,
          suggestedAction: "Send Gift Aid declaration form",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id, potentialClaim: potential },
        };
      }
      return null;
    },
  },
  {
    id: "major_donor_no_contact",
    title: "Major donor may need personal contact",
    insightType: "donor",
    severity: "info",
    evaluate: (ctx) => {
      if (
        ctx.totalGiving > ctx.church90thPercentile &&
        ctx.church90thPercentile > 0 &&
        ctx.daysSinceLastGift > 180
      ) {
        return {
          description: `${ctx.donor.name} is a top donor (£${ctx.totalGiving.toLocaleString()} total) but hasn't given in ${ctx.daysSinceLastGift} days.`,
          confidence: 0.75,
          suggestedAction: "Personal outreach from leadership",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id },
        };
      }
      return null;
    },
  },
  {
    id: "stopped_standing_order",
    title: "Monthly donor missed expected payment",
    insightType: "donor",
    severity: "warning",
    evaluate: (ctx) => {
      const monthlyPledge = ctx.pledges.find(
        (p) => p.frequency === "Monthly" && p.status === "Active"
      );
      if (monthlyPledge && ctx.daysSinceLastGift > 45) {
        return {
          description: `${ctx.donor.name} has an active monthly pledge but no gift received in ${ctx.daysSinceLastGift} days.`,
          confidence: 0.85,
          suggestedAction: "Check if standing order has stopped",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id, pledgeId: monthlyPledge._id },
        };
      }
      return null;
    },
  },
  {
    id: "upgrade_candidate",
    title: "Donor increased giving significantly",
    insightType: "donor",
    severity: "info",
    evaluate: (ctx) => {
      if (ctx.prevYtdGiving > 50 && ctx.ytdGiving > ctx.prevYtdGiving * 1.5) {
        const increase = Math.round(
          (ctx.ytdGiving / ctx.prevYtdGiving - 1) * 100
        );
        return {
          description: `${ctx.donor.name}'s giving is up ${increase}% this year - consider thanking them personally!`,
          confidence: 0.9,
          suggestedAction: "Send personalized thank you",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id },
        };
      }
      return null;
    },
  },
  {
    id: "multi_fund_supporter",
    title: "Donor supports multiple ministries",
    insightType: "donor",
    severity: "info",
    evaluate: (ctx) => {
      if (ctx.uniqueFunds >= 3) {
        return {
          description: `${ctx.donor.name} gives to ${ctx.uniqueFunds} different funds - they're a holistic supporter of your ministry.`,
          confidence: 0.95,
          suggestedAction: "Share ministry impact report",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id },
        };
      }
      return null;
    },
  },
  {
    id: "first_gift_anniversary",
    title: "Donor's giving anniversary this month",
    insightType: "donor",
    severity: "info",
    evaluate: (ctx) => {
      if (!ctx.firstGiftDate) return null;
      const firstDate = new Date(ctx.firstGiftDate);
      const now = new Date();
      if (
        firstDate.getMonth() === now.getMonth() &&
        firstDate.getFullYear() < now.getFullYear()
      ) {
        const years = now.getFullYear() - firstDate.getFullYear();
        return {
          description: `${ctx.donor.name} started giving ${years} year${years > 1 ? "s" : ""} ago this month!`,
          confidence: 1.0,
          suggestedAction: "Send anniversary thank you",
          actionUrl: `/donors`,
          actionData: { donorId: ctx.donor._id, years },
        };
      }
      return null;
    },
  },
];
