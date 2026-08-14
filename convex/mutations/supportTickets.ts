import { internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireMembership } from "../lib/auth";
import {
  createSupportReference,
  normalizeSupportText,
  SUPPORT_TICKET_LIMITS,
  validateSupportTicketInput,
} from "../../lib/supportTickets";

const USER_HOURLY_LIMIT = 5;
const ORGANIZATION_DAILY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const SYNC_STALE_AFTER_MS = 10 * 60 * 1_000;
const MAX_AUTOMATIC_SYNC_ATTEMPTS = 8;

const ticketTypeValidator = v.union(
  v.literal("bug"),
  v.literal("question"),
  v.literal("feature")
);
const ticketImpactValidator = v.union(
  v.literal("blocking"),
  v.literal("difficult"),
  v.literal("minor")
);
const ticketStatusValidator = v.union(
  v.literal("submitted"),
  v.literal("under_review"),
  v.literal("in_progress"),
  v.literal("waiting_for_reporter"),
  v.literal("resolved"),
  v.literal("closed")
);

export const submit = mutation({
  args: {
    type: ticketTypeValidator,
    impact: ticketImpactValidator,
    title: v.string(),
    description: v.string(),
    expectedBehaviour: v.optional(v.string()),
    reproductionSteps: v.optional(v.string()),
    appPath: v.string(),
    appRelease: v.string(),
    browserSummary: v.string(),
  },
  handler: async (ctx, args) => {
    // Support remains available to signed-in members whose product access is
    // blocked, because access and billing failures are valid support cases.
    const user = await requireMembership(ctx);
    const { title, description } = validateSupportTicketInput(args);
    const now = Date.now();

    const recentByUser = await ctx.db
      .query("supportTickets")
      .withIndex("by_createdBy_createdAt", (q) =>
        q.eq("createdBy", user._id).gte("createdAt", now - HOUR_MS)
      )
      .take(USER_HOURLY_LIMIT);
    if (recentByUser.length >= USER_HOURLY_LIMIT) {
      throw new Error("You have submitted several requests recently. Please try again in an hour.");
    }

    const recentByOrganization = await ctx.db
      .query("supportTickets")
      .withIndex("by_organization_createdAt", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .gte("createdAt", now - DAY_MS)
      )
      .take(ORGANIZATION_DAILY_LIMIT);
    if (recentByOrganization.length >= ORGANIZATION_DAILY_LIMIT) {
      throw new Error("Your organisation has reached today's support request limit. Please contact ChurchCoin directly if the issue is urgent.");
    }

    const optionalText = (value: string | undefined, maxLength: number) => {
      if (!value) return undefined;
      const normalized = normalizeSupportText(value, maxLength);
      return normalized || undefined;
    };

    const ticketId = await ctx.db.insert("supportTickets", {
      organizationId: user.organizationId,
      createdBy: user._id,
      reference: "pending",
      type: args.type,
      impact: args.impact,
      title,
      description,
      expectedBehaviour: optionalText(
        args.expectedBehaviour,
        SUPPORT_TICKET_LIMITS.expectedBehaviour
      ),
      reproductionSteps: optionalText(
        args.reproductionSteps,
        SUPPORT_TICKET_LIMITS.reproductionSteps
      ),
      reporterRole: user.role,
      appPath:
        normalizeSupportText(args.appPath, SUPPORT_TICKET_LIMITS.appPath) ||
        "/unknown",
      appRelease:
        normalizeSupportText(args.appRelease, SUPPORT_TICKET_LIMITS.appRelease) ||
        "unknown",
      browserSummary:
        normalizeSupportText(
          args.browserSummary,
          SUPPORT_TICKET_LIMITS.browserSummary
        ) || "unknown",
      status: "submitted",
      githubSyncStatus: "pending",
      githubSyncAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    const reference = createSupportReference(String(ticketId));
    await ctx.db.patch(ticketId, { reference });
    await ctx.scheduler.runAfter(
      0,
      internal.actions.supportTickets.syncToGitHub,
      { ticketId }
    );

    return { ticketId, reference };
  },
});

export const claimForGithubSync = internalMutation({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.githubSyncStatus === "synced") {
      return { claimed: false as const, ticket: null };
    }

    const now = Date.now();
    if (
      ticket.githubSyncStatus === "syncing" &&
      ticket.githubSyncAttemptedAt &&
      now - ticket.githubSyncAttemptedAt < SYNC_STALE_AFTER_MS
    ) {
      return { claimed: false as const, ticket: null };
    }

    await ctx.db.patch(ticket._id, {
      githubSyncStatus: "syncing",
      githubSyncAttempts: ticket.githubSyncAttempts + 1,
      githubSyncAttemptedAt: now,
      githubSyncError: undefined,
      updatedAt: now,
    });
    return {
      claimed: true as const,
      ticket: { ...ticket, githubSyncAttempts: ticket.githubSyncAttempts + 1 },
    };
  },
});

export const markGithubSynced = internalMutation({
  args: {
    ticketId: v.id("supportTickets"),
    repository: v.string(),
    issueNumber: v.number(),
    issueUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return;
    await ctx.db.patch(ticket._id, {
      githubSyncStatus: "synced",
      githubRepository: args.repository,
      githubIssueNumber: args.issueNumber,
      githubIssueUrl: args.issueUrl,
      githubSyncError: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const markGithubSyncFailed = internalMutation({
  args: {
    ticketId: v.id("supportTickets"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return { attempts: MAX_AUTOMATIC_SYNC_ATTEMPTS };
    await ctx.db.patch(ticket._id, {
      githubSyncStatus: "failed",
      githubSyncError: args.error.slice(0, 300),
      updatedAt: Date.now(),
    });
    return { attempts: ticket.githubSyncAttempts };
  },
});

export const applyGithubStatus = internalMutation({
  args: {
    repository: v.string(),
    issueNumber: v.number(),
    status: ticketStatusValidator,
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query("supportTickets")
      .withIndex("by_github_repository_issue", (q) =>
        q
          .eq("githubRepository", args.repository)
          .eq("githubIssueNumber", args.issueNumber)
      )
      .unique();
    if (!ticket) return { updated: false };
    await ctx.db.patch(ticket._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

export const scheduleFailedGithubSyncs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("supportTickets")
      .withIndex("by_githubSyncStatus_createdAt", (q) =>
        q.eq("githubSyncStatus", "failed")
      )
      .take(20);
    const staleSyncing = await ctx.db
      .query("supportTickets")
      .withIndex("by_githubSyncStatus_createdAt", (q) =>
        q.eq("githubSyncStatus", "syncing")
      )
      .filter((q) =>
        q.lt(q.field("githubSyncAttemptedAt"), Date.now() - SYNC_STALE_AFTER_MS)
      )
      .take(10);

    const retryable = [...failed, ...staleSyncing].filter(
      (ticket) => ticket.githubSyncAttempts < MAX_AUTOMATIC_SYNC_ATTEMPTS
    );
    for (const ticket of retryable) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.supportTickets.syncToGitHub,
        { ticketId: ticket._id }
      );
    }
    return { scheduled: retryable.length };
  },
});
