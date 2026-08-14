"use node";

import { makeFunctionReference } from "convex/server";
import { internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
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

const claimForGithubSync = makeFunctionReference<
  "mutation",
  { ticketId: Id<"supportTickets"> },
  | { claimed: false; ticket: null }
  | { claimed: true; ticket: Doc<"supportTickets"> }
>("mutations/supportTickets:claimForGithubSync");

const markGithubSynced = makeFunctionReference<
  "mutation",
  {
    ticketId: Id<"supportTickets">;
    repository: string;
    issueNumber: number;
    issueUrl: string;
  },
  void
>("mutations/supportTickets:markGithubSynced");

const markGithubSyncFailed = makeFunctionReference<
  "mutation",
  { ticketId: Id<"supportTickets">; error: string; retryable: boolean },
  { attempts: number }
>("mutations/supportTickets:markGithubSyncFailed");

const syncSupportTicketToGitHub = makeFunctionReference<
  "action",
  { ticketId: Id<"supportTickets"> },
  void
>("actions/supportTickets:syncToGitHub");

export const syncToGitHub = internalAction({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args): Promise<void> => {
    const claim = await ctx.runMutation(
      claimForGithubSync,
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
        claim.ticket.reference,
        claim.ticket.createdAt
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
        markGithubSynced,
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
      const retryable =
        error instanceof GitHubSupportError ? error.retryable : true;
      const result = await ctx.runMutation(
        markGithubSyncFailed,
        { ticketId: args.ticketId, error: message, retryable }
      );
      const delay = RETRY_DELAYS_MS[result.attempts - 1];
      if (retryable && delay !== undefined) {
        await ctx.scheduler.runAfter(
          delay,
          syncSupportTicketToGitHub,
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
