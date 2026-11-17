import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { aiUsageLimits, AI_USAGE_WINDOW_MS } from "../lib/aiValidation";

const DAY_MS = 86_400_000;

type UsageRow = Doc<"aiRateLimits"> | null;

// Loads every counter one charge touches: the church's row (its minute
// window and its UTC day), the deployment's day, and the person's minute
// window when a person is asking. Nothing is written until charge() runs.
async function loadUsage(ctx: MutationCtx, organizationId: Id<"organizations">, userId: Id<"users"> | undefined) {
  const now = Date.now();
  const windowStart = Math.floor(now / AI_USAGE_WINDOW_MS) * AI_USAGE_WINDOW_MS;
  const day = new Date(now).toISOString().slice(0, 10);
  const windowRow = (rowUserId: Id<"users"> | undefined) =>
    ctx.db
      .query("aiRateLimits")
      .withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", rowUserId))
      .first();
  const [organizationRow, userRow, deploymentDay] = await Promise.all([
    windowRow(undefined),
    userId ? windowRow(userId) : Promise.resolve(null),
    ctx.db.query("aiDailyUsage").withIndex("by_day", (q) => q.eq("day", day)).first(),
  ]);
  const minuteUsed = (row: UsageRow) => (row && row.windowStart === windowStart ? row.requestCount : 0);
  const churchDayUsed = organizationRow?.day === day ? (organizationRow.dayUnits ?? 0) : 0;

  return {
    limits: aiUsageLimits(),
    now,
    windowStart,
    nextDayStart: (Math.floor(now / DAY_MS) + 1) * DAY_MS,
    organizationMinute: minuteUsed(organizationRow),
    userMinute: minuteUsed(userRow),
    churchDay: churchDayUsed,
    deploymentDay: deploymentDay?.units ?? 0,
    // Interactive work fills the minute windows; background work only the days.
    charge: async (units: number, { minutes }: { minutes: boolean }) => {
      const organizationFields = {
        day,
        dayUnits: churchDayUsed + units,
        updatedAt: now,
        ...(minutes ? { windowStart, requestCount: minuteUsed(organizationRow) + units } : {}),
      };
      if (organizationRow) await ctx.db.patch(organizationRow._id, organizationFields);
      else {
        await ctx.db.insert("aiRateLimits", {
          organizationId,
          windowStart: minutes ? windowStart : 0,
          requestCount: minutes ? units : 0,
          ...organizationFields,
        });
      }
      if (minutes && userId) {
        const requestCount = minuteUsed(userRow) + units;
        if (userRow) await ctx.db.patch(userRow._id, { windowStart, requestCount, updatedAt: now });
        else await ctx.db.insert("aiRateLimits", { organizationId, userId, windowStart, requestCount, updatedAt: now });
      }
      if (deploymentDay) await ctx.db.patch(deploymentDay._id, { units: deploymentDay.units + units, updatedAt: now });
      else await ctx.db.insert("aiDailyUsage", { day, units, updatedAt: now });
    },
  };
}

type Usage = Awaited<ReturnType<typeof loadUsage>>;

const dailyRefusal = (usage: Usage, units: number) =>
  usage.deploymentDay + units > usage.limits.deploymentPerDay
    ? "AI features have reached today's usage limit. Please try again tomorrow."
    : usage.churchDay + units > usage.limits.organizationPerDay
      ? "Your church has reached today's AI usage limit. Please try again tomorrow."
      : null;

const validUnits = (units: number) => {
  if (!Number.isInteger(units) || units < 1) throw new Error("Invalid AI usage units");
};

// Charges `units` of AI work against the caller, their church's minute and
// day, and the deployment's day. Every limit is checked before any is charged.
export const checkAndConsume = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    units: v.number(),
  },
  handler: async (ctx, args) => {
    validUnits(args.units);
    const usage = await loadUsage(ctx, args.organizationId, args.userId);
    const refusal = dailyRefusal(usage, args.units);
    if (refusal) throw new Error(refusal);
    if (
      usage.userMinute + args.units > usage.limits.userPerMinute ||
      usage.organizationMinute + args.units > usage.limits.organizationPerMinute
    ) {
      throw new Error("AI rate limit exceeded. Please wait a minute and try again.");
    }
    await usage.charge(args.units, { minutes: true });
    return {
      remaining: usage.limits.userPerMinute - usage.userMinute - args.units,
      resetAt: usage.windowStart + AI_USAGE_WINDOW_MS,
    };
  },
});

// Charges background AI work (search indexing) against the church's and the
// deployment's day, leaving the minute windows to interactive use so indexing
// an import never blocks the person who ran it. A spent budget is not an
// error here: it answers "deferred" with the next UTC day so the caller keeps
// the work and retries then.
export const consumeBackgroundUnits = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    units: v.number(),
  },
  returns: v.union(
    v.object({ status: v.literal("charged") }),
    v.object({ status: v.literal("deferred"), retryAt: v.number() }),
    v.object({ status: v.literal("organizationMissing") })
  ),
  handler: async (ctx, args) => {
    validUnits(args.units);
    if (!(await ctx.db.get(args.organizationId))) return { status: "organizationMissing" as const };
    const usage = await loadUsage(ctx, args.organizationId, undefined);
    if (dailyRefusal(usage, args.units)) return { status: "deferred" as const, retryAt: usage.nextDayStart };
    await usage.charge(args.units, { minutes: false });
    return { status: "charged" as const };
  },
});
