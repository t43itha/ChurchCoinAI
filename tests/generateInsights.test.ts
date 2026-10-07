import { describe, expect, it } from "vitest";
import { gatherInsightContext } from "../convex/intelligence/generateInsights";
import { OPERATIONS_RULES, type OperationsRuleContext } from "../convex/intelligence/rules/operationsRules";
import { fixture, invoke, row } from "./helpers/convexFixture";

describe("gatherInsightContext", () => {
  it("counts a transfer leg in the reconciliation check but not its journal twin", async () => {
    const offerings = Array.from({ length: 9 }, (_, i) =>
      row(`offering-${i}`, { isReconciled: true, date: "2026-10-01" })
    );
    const { ctx } = fixture({
      transactions: [
        ...offerings,
        row("transfer", {
          type: "Expenditure",
          category: "Transfer between funds",
          movementKind: "transfer",
        }),
        row("journal", {
          type: "Expenditure",
          category: "Transfer between funds",
          movementKind: "transfer",
          isJournal: true,
        }),
      ],
    });

    const { operationsContext } = (await invoke(gatherInsightContext, ctx, { organizationId: "org" })) as {
      operationsContext: OperationsRuleContext;
    };
    expect(operationsContext.totalTransactions).toBe(10);
    expect(operationsContext.unreconciledCount).toBe(1);

    const rule = OPERATIONS_RULES.find((candidate) => candidate.id === "month_end_almost_complete");
    expect(rule?.evaluate(operationsContext)?.description).toContain("90%");
  });
});
