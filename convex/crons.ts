import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

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
  internal.mutations.supportTickets.scheduleFailedGithubSyncs
);

export default crons;
