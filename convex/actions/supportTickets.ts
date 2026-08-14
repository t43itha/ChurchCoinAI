"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  buildGithubIssueBody,
  buildGithubIssueTitle,
  githubLabelForTicketType,
} from "../../lib/supportTickets";
import {
  assertPrivateSupportRepository,
  createSupportIssue,
  findExistingSupportIssue,
  getGitHubSupportConfig,
  getGitHubSupportToken,
  GitHubSupportError,
} from "../lib/githubSupport";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

export const syncToGitHub = internalAction({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args): Promise<void> => {
    const claim = await ctx.runMutation(
      internal.mutations.supportTickets.claimForGithubSync,
      { ticketId: args.ticketId }
    );
    if (!claim.claimed || !claim.ticket) return;

    try {
      const config = getGitHubSupportConfig();
      const token = await getGitHubSupportToken(config);
      await assertPrivateSupportRepository(config, token);

      const title = buildGithubIssueTitle(
        claim.ticket.reference,
        claim.ticket.title
      );
      const body = buildGithubIssueBody(claim.ticket);
      const existing = await findExistingSupportIssue(
        config,
        token,
        claim.ticket.reference
      );
      const issue =
        existing ??
        (await createSupportIssue({
          config,
          token,
          title,
          body,
          labels: [
            "customer-report",
            githubLabelForTicketType(claim.ticket.type),
            "status:triage",
          ],
        }));

      await ctx.runMutation(
        internal.mutations.supportTickets.markGithubSynced,
        {
          ticketId: args.ticketId,
          repository: config.repository,
          issueNumber: issue.number,
          issueUrl: issue.html_url,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown GitHub sync failure";
      const result = await ctx.runMutation(
        internal.mutations.supportTickets.markGithubSyncFailed,
        { ticketId: args.ticketId, error: message }
      );
      const retryable =
        error instanceof GitHubSupportError ? error.retryable : true;
      const delay = RETRY_DELAYS_MS[result.attempts - 1];
      if (retryable && delay !== undefined) {
        await ctx.scheduler.runAfter(
          delay,
          internal.actions.supportTickets.syncToGitHub,
          { ticketId: args.ticketId }
        );
      }
      console.error("Support ticket GitHub sync failed", {
        ticketId: args.ticketId,
        attempts: result.attempts,
        retryable,
        message,
      });
    }
  },
});
