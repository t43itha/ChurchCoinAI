import { afterEach, describe, expect, it, vi } from "vitest";
import http from "../convex/http";

type Handler = { _handler: (ctx: unknown, request: Request) => Promise<Response> };

const call = async (path: string, method: "GET" | "POST", url: string) => {
  const match = http.lookup(path, method);
  if (!match) throw new Error(`No route for ${method} ${path}`);
  const ctx = { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: { runAfter: vi.fn() } };
  const response = await (match[0] as unknown as Handler)._handler(ctx, new Request(url, { method }));
  return { response, ctx };
};

afterEach(() => vi.unstubAllEnvs());

describe("integration routes while their feature is off", () => {
  it("refuses Stripe webhooks before reading the body or touching data", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    const { response, ctx } = await call("/stripe/webhook", "POST", "https://example.convex.site/stripe/webhook");

    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/Billing is not enabled/);
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("refuses Yapily callbacks without claiming any pending connection", async () => {
    vi.stubEnv("BANK_FEEDS_ENABLED", "");
    const { response, ctx } = await call(
      "/yapily/callback",
      "GET",
      "https://example.convex.site/yapily/callback?state=abc&one-time-token=xyz"
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/Bank feeds are not available/);
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("lets the Yapily callback through once bank feeds are on", async () => {
    vi.stubEnv("BANK_FEEDS_ENABLED", "true");
    const { response } = await call("/yapily/callback", "GET", "https://example.convex.site/yapily/callback");

    expect(response.status).toBe(200);
  });
});
