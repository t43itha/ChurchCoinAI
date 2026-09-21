import { Id } from "../_generated/dataModel";
import { sumReportableIncome } from "../../lib/reportableTransactions";
import { pledgeFulfillmentTarget } from "../../lib/pledgeProgress";
import { meetsMoneyTarget } from "./money";

type PledgeStatusCtx = {
  db: {
    get: (id: Id<"pledges">) => Promise<any>;
    query: (table: "transactions") => any;
    patch: (id: Id<"pledges">, value: { status: "Active" | "Completed" }) => Promise<void>;
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

  const linkedTransactions = await ctx.db
    .query("transactions")
    .withIndex("by_pledge", (q: any) => q.eq("pledgeId", pledgeId))
    .collect();
  const totalReceived = sumReportableIncome(linkedTransactions);
  const target = pledgeFulfillmentTarget(pledge);
  const nextStatus =
    target !== null && meetsMoneyTarget(totalReceived, target)
      ? "Completed"
      : "Active";

  if (pledge.status !== nextStatus) {
    await ctx.db.patch(pledgeId, { status: nextStatus });
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
