import { Id } from "../_generated/dataModel";
import { sumReportableIncome } from "../../lib/reportableTransactions";
import { automaticPledgeStatus } from "../../lib/pledgeProgress";

type PledgeStatusCtx = {
  db: {
    get: (id: Id<"pledges">) => Promise<any>;
    query: (table: "transactions") => any;
    patch: (
      id: Id<"pledges">,
      value: { status: "Active" | "Completed"; completionOverride: boolean }
    ) => Promise<void>;
  };
};

export async function refreshPledgeStatus(
  ctx: PledgeStatusCtx,
  pledgeId: Id<"pledges">,
  organizationId: Id<"organizations">
) {
  const pledge = await ctx.db.get(pledgeId);
  if (!pledge || pledge.organizationId !== organizationId) return null;
  if (pledge.status === "Cancelled") return null;
  if (pledge.completionOverride && pledge.status === "Completed") {
    return {
      completed: true,
      pledgeId,
      donorName: pledge.donorName,
      amount: pledge.amount,
    };
  }

  const linkedTransactions = await ctx.db
    .query("transactions")
    .withIndex("by_pledge", (q: any) => q.eq("pledgeId", pledgeId))
    .collect();
  const totalReceived = sumReportableIncome(linkedTransactions);
  const nextStatus = automaticPledgeStatus(pledge, totalReceived);
  // Open-ended recurring pledges have no finish line. Leave their status
  // alone instead of forcing Active or reopening an explicit completion.
  if (nextStatus === null) return null;

  if (pledge.status !== nextStatus || pledge.completionOverride) {
    await ctx.db.patch(pledgeId, {
      status: nextStatus,
      completionOverride: false,
    });
  }

  return nextStatus === "Completed"
    ? {
        completed: true,
        pledgeId,
        donorName: pledge.donorName,
        amount: pledge.amount,
      }
    : null;
}
