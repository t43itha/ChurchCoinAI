import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { aiUsageLimits, AI_USAGE_WINDOW_MS, positiveInteger } from "../lib/aiValidation";

const DAY_MS = 86_400_000;

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

// ---------------------------------------------------------------- daily abuse counters

const DAILY_CAP_DEFAULTS = {
  // Matches one church's daily invitation allowance: onboarding a whole team
  // fits in a day, and erasing and recreating a church does not add more.
  personInvitationEmails: 25,
  // One church a day, plus one start-over after erasing it.
  personChurchCreations: 2,
  // Matches one church's daily AI allowance (AI_ORG_DAILY_UNITS).
  personAIUnits: 10_000,
  // Every church together: 40 to 60 new churches a day each inviting a few
  // people, while a spam burst is stopped at 200 emails.
  deploymentInvitationEmails: 200,
};

export type DailyCaps = typeof DAILY_CAP_DEFAULTS;

export function dailyCaps(env: Record<string, string | undefined> = process.env): DailyCaps {
  return {
    personInvitationEmails: positiveInteger(env.INVITE_EMAILS_PER_PERSON_DAILY, DAILY_CAP_DEFAULTS.personInvitationEmails),
    personChurchCreations: positiveInteger(env.CHURCH_CREATIONS_PER_PERSON_DAILY, DAILY_CAP_DEFAULTS.personChurchCreations),
    personAIUnits: positiveInteger(env.AI_PERSON_DAILY_UNITS, DAILY_CAP_DEFAULTS.personAIUnits),
    deploymentInvitationEmails: positiveInteger(env.INVITE_EMAILS_DAILY, DAILY_CAP_DEFAULTS.deploymentInvitationEmails),
  };
}

/** Counters for a signed-in person are keyed by their Clerk subject, which outlives any church. */
export const personScope = (subject: string) => `person:${subject}`;
export const DEPLOYMENT_SCOPE = "deployment";

type DailyCounter = "invitationEmails" | "churchCreations" | "aiUnits";
export type DailyCharge = { scope: string; counter: DailyCounter; amount: number; cap: number; refusal: string };

/**
 * Loads today's counters for each charge. `refusal` is the first charge that
 * would pass its cap; `commit` writes them all. Callers check every limit
 * they enforce before committing any, so a refused request costs nothing.
 * Each charge must name a different scope.
 */
export async function loadDailyCharges(ctx: MutationCtx, charges: DailyCharge[], now = Date.now()) {
  const day = utcDay(now);
  const rows = await Promise.all(
    charges.map((charge) =>
      ctx.db
        .query("usageCounters")
        .withIndex("by_scope_day", (q) => q.eq("scope", charge.scope).eq("day", day))
        .first()
    )
  );
  const used = (index: number) => rows[index]?.[charges[index].counter] ?? 0;
  const refused = charges.find((charge, index) => used(index) + charge.amount > charge.cap);
  return {
    refusal: refused?.refusal ?? null,
    commit: async () => {
      for (const [index, charge] of charges.entries()) {
        const row = rows[index];
        const fields = { [charge.counter]: used(index) + charge.amount, updatedAt: now };
        if (row) await ctx.db.patch(row._id, fields);
        else await ctx.db.insert("usageCounters", { scope: charge.scope, day, ...fields });
      }
    },
  };
}

// ---------------------------------------------------------------- AI units

type UsageRow = Doc<"aiRateLimits"> | null;

// Loads every counter one charge touches: the church's row (its minute
// window and its UTC day), the deployment's day, the person's minute window
// and the person's day when a person is asking. Nothing is written until
// charge() runs.
async function loadUsage(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  person: { userId: Id<"users">; principal: string } | undefined
) {
  const now = Date.now();
  const windowStart = Math.floor(now / AI_USAGE_WINDOW_MS) * AI_USAGE_WINDOW_MS;
  const day = utcDay(now);
  const limits = aiUsageLimits();
  const windowRow = (rowUserId: Id<"users"> | undefined) =>
    ctx.db
      .query("aiRateLimits")
      .withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", rowUserId))
      .first();
  const [organizationRow, userRow, deploymentDay] = await Promise.all([
    windowRow(undefined),
    person ? windowRow(person.userId) : Promise.resolve(null),
    ctx.db.query("aiDailyUsage").withIndex("by_day", (q) => q.eq("day", day)).first(),
  ]);
  const minuteUsed = (row: UsageRow) => (row && row.windowStart === windowStart ? row.requestCount : 0);
  const churchDayUsed = organizationRow?.day === day ? (organizationRow.dayUnits ?? 0) : 0;

  return {
    limits,
    now,
    windowStart,
    nextDayStart: (Math.floor(now / DAY_MS) + 1) * DAY_MS,
    organizationMinute: minuteUsed(organizationRow),
    userMinute: minuteUsed(userRow),
    churchDay: churchDayUsed,
    deploymentDay: deploymentDay?.units ?? 0,
    personDay: async (units: number) => {
      if (!person) return null;
      const cap = dailyCaps().personAIUnits;
      return loadDailyCharges(ctx, [{
        scope: personScope(person.principal),
        counter: "aiUnits",
        amount: units,
        cap,
        refusal: "You have reached your AI usage limit for today. Please try again tomorrow.",
      }], now);
    },
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
      if (minutes && person) {
        const requestCount = minuteUsed(userRow) + units;
        if (userRow) await ctx.db.patch(userRow._id, { windowStart, requestCount, updatedAt: now });
        else await ctx.db.insert("aiRateLimits", { organizationId, userId: person.userId, windowStart, requestCount, updatedAt: now });
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

// Charges `units` of AI work against the caller's minute and day, their
// church's minute and day, and the deployment's day. Every limit is checked
// before any is charged. The person's day is keyed by `principal` (their
// Clerk subject), so recreating a church does not refill it.
export const checkAndConsume = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    principal: v.string(),
    units: v.number(),
  },
  handler: async (ctx, args) => {
    validUnits(args.units);
    const usage = await loadUsage(ctx, args.organizationId, { userId: args.userId, principal: args.principal });
    const refusal = dailyRefusal(usage, args.units);
    if (refusal) throw new Error(refusal);
    const personDay = await usage.personDay(args.units);
    if (personDay?.refusal) throw new Error(personDay.refusal);
    if (
      usage.userMinute + args.units > usage.limits.userPerMinute ||
      usage.organizationMinute + args.units > usage.limits.organizationPerMinute
    ) {
      throw new Error("AI rate limit exceeded. Please wait a minute and try again.");
    }
    await usage.charge(args.units, { minutes: true });
    await personDay?.commit();
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
