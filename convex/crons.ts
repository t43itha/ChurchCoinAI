import { cronJobs, makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";

const scheduleFailedGithubSyncs = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { scheduled: number }
>("mutations/supportTickets:scheduleFailedGithubSyncs");

const crons = cronJobs();

crons.daily(
  "expire pending invitations",
  { hourUTC: 2, minuteUTC: 0 },
  internal.mutations.scheduledMaintenance.expirePendingInvitations
);

crons.daily(
  "expire lapsed bank consents",
  { hourUTC: 2, minuteUTC: 15 },
  internal.mutations.scheduledMaintenance.expireBankConsents
);

crons.daily(
  "cleanup expired pending bank connections",
  { hourUTC: 2, minuteUTC: 30 },
  internal.mutations.scheduledMaintenance.cleanupExpiredPendingBankConnections
);

crons.interval(
  "retry support tickets awaiting GitHub sync",
  { minutes: 30 },
  scheduleFailedGithubSyncs
);

export default crons;
