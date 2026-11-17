// Every screen that calls a size-capped AI action must still get its answer
// for a church the size of the largest live one: about 6,000 transactions over
// five years from 200 donors. Each case builds the screen's real arguments and
// runs the real action, so a payload that grows with the ledger fails here.
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../convex/_generated/server";
import * as ai from "../convex/actions/ai";
import { getAIContext } from "../convex/queries/aiContext";
import { aiUsageLimits } from "../convex/lib/aiValidation";
import { sumMoney } from "../convex/lib/money";
import {
  annualStatementArgs,
  autoCategoriseBatch,
  chatContextData,
  giftAidScheduleArgs,
  monthlyBreakdownArgs,
  projectReportArgs,
  treasurerReportArgs,
  type AIContext,
} from "../lib/aiActionInputs";
import type { Fund, Transaction } from "../types";
import { fixture, invoke } from "./helpers/convexFixture";

const generateContent = vi.hoisted(() => vi.fn(async () => ({ text: "Report" })));
vi.mock("@google/genai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent }; },
}));

afterEach(() => { vi.unstubAllEnvs(); generateContent.mockClear(); });

const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(30, "0")}`;
const funds: Fund[] = Array.from({ length: 12 }, (_, i) => ({
  _id: id("fd", i), name: `Fund ${i} building and mission appeal`, type: i < 4 ? "Unrestricted" : "Restricted", balance: 12_345.67 * (i + 1), targetAmount: 50_000,
}));
const incomeCategories = ["Tithes & First Fruits", "Offerings", "Thanksgiving", "Special Projects", "Gift Aid Refund", "Donations"];
const spendingCategories = ["Rent", "Utilities", "Salaries", "Mission Support", "Office Costs", "Insurance", "Love Gifts", "Events"];

// 6,000 rows from 2021-11 to 2026-11: two thirds gifts from 200 named donors
// (60% of them Gift Aid eligible), a third spending, with bank-length text.
const church: Transaction[] = Array.from({ length: 6_000 }, (_, i) => {
  const day = new Date(Date.UTC(2021, 10, 1) + Math.floor(i * (1_826 / 6_000)) * 86_400_000).toISOString().slice(0, 10);
  const donor = i % 200;
  const isIncome = i % 3 !== 0;
  return {
    _id: id("tx", i),
    date: day,
    description: isIncome
      ? `FASTER PAYMENT RECEIVED REF TITHE DONOR ${donor} 4471${i} GB${i % 97}`
      : `DIRECT DEBIT PAYMENT TO SUPPLIER ${i % 40} LTD INVOICE ${i} REF ${i * 7}`,
    amount: isIncome ? 5 + (i % 60) * 12.5 : 40 + (i % 50) * 37.25,
    type: isIncome ? "Income" : "Expenditure",
    category: isIncome ? incomeCategories[i % incomeCategories.length] : spendingCategories[i % spendingCategories.length],
    fundId: funds[i % funds.length]._id,
    isReconciled: i % 5 !== 0,
    notes: "Matched by rule | Confidence: High | imported from statement",
    paymentMethod: "Bank",
    ...(isIncome ? { donorId: id("dn", donor), donorName: `Donor ${donor} Surname-Example`, isGiftAidEligible: Math.floor(i / 200) % 5 < 3 } : {}),
  } as Transaction;
});
const allTime = {};

function actionCtx() {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  const runMutation = vi.fn(async (_reference: unknown, _args: { units: number }) => null);
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "clerk" }) },
    runMutation,
    runQuery: vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(reference) === "queries/users:currentWithAccess"
        ? { user: { _id: "user", organizationId: "org", role: "Admin" }, access: { canUseApp: true } }
        : { giftAidEnabled: true }),
  } as unknown as ActionCtx;
  return { ctx, runMutation };
}
const run = (name: keyof typeof ai, args: unknown, ctx = actionCtx().ctx) =>
  (ai[name] as unknown as { _handler: (ctx: ActionCtx, args: unknown) => Promise<unknown> })._handler(ctx, args);
const prompt = () => (generateContent.mock.calls.at(-1) as unknown as [{ contents: string }])[0].contents;

describe("AI report inputs for a large church", () => {
  it("drafts an all-time Gift Aid schedule covering every eligible gift", async () => {
    const eligible = church.filter((t) => t.type === "Income" && t.isGiftAidEligible);
    expect(eligible.length).toBeGreaterThan(2_000);

    await expect(run("generateGiftAidSchedule", giftAidScheduleArgs(church, allTime))).resolves.toBe("Report");
    expect(prompt()).toContain(`**Total Eligible Donations**: £${sumMoney(eligible, (t) => t.amount).toFixed(2)}`);
    expect(prompt()).toContain("Number of Gift Aid givers: 200");
  });

  it("keeps a period's Gift Aid schedule to that period", async () => {
    const range = { start: "2025-04-06", end: "2026-04-05" };
    const eligible = church.filter((t) => t.type === "Income" && t.isGiftAidEligible && t.date >= range.start && t.date <= range.end);
    await run("generateGiftAidSchedule", giftAidScheduleArgs(church, range));
    expect(prompt()).toContain(`**Total Eligible Donations**: £${sumMoney(eligible, (t) => t.amount).toFixed(2)}`);
  });

  it("drafts the treasurer's commentary", async () => {
    await expect(run("generateTreasurerReport", treasurerReportArgs(church, funds))).resolves.toBe("Report");
  });

  it("drafts a project update for the busiest fund over all time", async () => {
    await expect(run("generateProjectReport", projectReportArgs(church, funds[0], allTime))).resolves.toBe("Report");
  });

  it("drafts the annual and monthly statements over all time", async () => {
    await expect(run("generateAnnualStatement", annualStatementArgs(church, allTime))).resolves.toBe("Report");
    await expect(run("generateMonthlyBreakdown", monthlyBreakdownArgs(church, allTime))).resolves.toBe("Report");
  });

  it("answers the co-pilot chat from the real AI context", async () => {
    const { ctx } = fixture({
      transactions: church.map((t) => ({ ...t, organizationId: "org" })),
      funds: funds.map((f) => ({ ...f, organizationId: "org" })),
    });
    const aiContext = (await invoke(getAIContext, ctx, {})) as AIContext;
    expect(aiContext.transactionCount).toBeGreaterThan(2_000);

    await expect(run("chatWithTreasurer", { message: "How are we doing?", contextData: chatContextData(aiContext) })).resolves.toBe("Report");
  });

  it("auto-categorises a full uncategorised selection in runs that fit the input and rate limits", async () => {
    const { ctx, runMutation } = actionCtx();
    const { descriptions, remaining } = autoCategoriseBatch(church);
    await expect(run("categorizeTransactions", { descriptions, fundNames: funds.map((f) => f.name), categories: incomeCategories }, ctx))
      .resolves.toEqual([]);
    expect(remaining).toBe(5_500);
    expect(runMutation.mock.calls[0][1].units).toBeLessThanOrEqual(aiUsageLimits({}).userPerMinute);
  });
});
