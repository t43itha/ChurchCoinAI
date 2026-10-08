import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { ActionCtx } from "../convex/_generated/server";

const generateContent = vi.hoisted(() => vi.fn(async () => ({ text: "Report" })));
vi.mock("@google/genai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent }; },
}));

import { chatWithTreasurer, generateGiftAidSchedule, generateRCIMonthlyNarrative } from "../convex/actions/ai";

function fixture(giftAidEnabled?: boolean) {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  return {
    auth: { getUserIdentity: async () => ({ subject: "clerk" }) },
    runMutation: vi.fn(async () => null),
    runQuery: vi.fn(async (ref: Parameters<typeof getFunctionName>[0]) => {
      if (getFunctionName(ref) === "queries/users:currentWithAccess") {
        return { user: { _id: "user", organizationId: "org", role: "Admin" }, access: { canUseApp: true } };
      }
      return { giftAidEnabled };
    }),
  } as unknown as ActionCtx;
}

const invoke = (fn: unknown, ctx: ActionCtx, args: Record<string, unknown>): Promise<unknown> =>
  (fn as { _handler: (ctx: ActionCtx, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Gift Aid in AI reports", () => {
  it("blocks a schedule before contacting Gemini when disabled", async () => {
    await expect(invoke(generateGiftAidSchedule, fixture(false), { eligibleTransactions: "[]" }))
      .rejects.toThrow("Gift Aid is switched off");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([false, true, undefined])("respects the church setting in monthly commentary (%s)", async enabled => {
    await invoke(generateRCIMonthlyNarrative, fixture(enabled), { monthlyReportData: JSON.stringify({
      monthName: "May", year: 2026, totals: { grossIncome: 100, totalExpenditure: 0 },
      giftAidSummary: { eligible: 100, claimable: 25 },
      tithes: [{ donorName: "Alex", amount: 100, isGiftAidEligible: true }],
    }) });
    const prompt = (generateContent.mock.calls[0] as unknown as [{ contents: string }])[0].contents;
    expect(prompt.includes("### Gift Aid Bonus")).toBe(enabled !== false);
    expect(prompt.includes("**HMRC Claimable**")).toBe(enabled !== false);
    expect(prompt.includes('"isGiftAidEligible"')).toBe(enabled !== false);
    expect(prompt).toContain("Alex");
  });

  it("informs Copilot that claims and declaration follow-up are disabled", async () => {
    await invoke(chatWithTreasurer, fixture(false), { message: "What needs attention?", contextData: "{}" });
    const request = (generateContent.mock.calls[0] as unknown as [{ config: { systemInstruction: string } }])[0];
    expect(request.config.systemInstruction).toContain("Gift Aid is disabled for this church");
  });
});
