import { query } from "../_generated/server";
import { redactDonorFields, requireCapability } from "../lib/auth";
import { summarizeLoan } from "../../lib/movementMatching";
import { can } from "../../lib/permissions";

export const listLoans = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "ledger.read");
    const hidesLender = !can(user.role, "donors.read");

    const movements = await ctx.db
      .query("movements")
      .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
      .collect();

    const loans = await Promise.all(
      movements
        .filter((movement) => movement.kind === "loan")
        .map(async (movement) => {
          const legs = await ctx.db
            .query("transactions")
            .withIndex("by_movement", (q) => q.eq("movementId", movement._id))
            .collect();

          return {
            _id: movement._id,
            lender: hidesLender ? "Lender hidden" : (movement.lender ?? ""),
            dueDate: movement.dueDate,
            note: hidesLender ? undefined : movement.note,
            createdAt: movement.createdAt,
            ...summarizeLoan(legs),
            legs: legs.map((leg) => {
              const visible = redactDonorFields(user, leg);
              return {
                _id: visible._id,
                date: visible.date,
                // Bank descriptions often name the lender.
                description: hidesLender ? (leg.type === "Income" ? "Loan received" : "Loan repayment") : visible.description,
                amount: visible.amount,
                type: visible.type,
                isVoided: visible.isVoided,
              };
            }),
          };
        })
    );

    return loans.sort((a, b) => b.createdAt - a.createdAt);
  },
});
