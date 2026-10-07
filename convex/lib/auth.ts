import { QueryCtx, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { can, ROLES, type Capability, type UserRole } from "../../lib/permissions";
import { Doc } from "../_generated/dataModel";
import { requireOrganizationAccess } from "./access";

export type { UserRole } from "../../lib/permissions";

export const roleValidator = v.union(...ROLES.map((role) => v.literal(role)));

/**
 * Get the current authenticated user from the database
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();

  return user;
}

/**
 * Get the Clerk identity (for users not yet in database)
 */
export async function getIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity();
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireMembership(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("Unauthorized: Please sign in to continue");
  }
  return user;
}

/**
 * Require authenticated membership and an active organization access grant.
 * Billing, onboarding, and access-status functions intentionally use
 * getCurrentUser/requireMembership instead so blocked Admins can recover.
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await requireMembership(ctx);
  await requireOrganizationAccess(ctx, user);
  return user;
}

/** Require a capability after authentication and organization access checks. */
export async function requireCapability(
  ctx: QueryCtx | MutationCtx,
  capability: Capability
) {
  const user = await requireAuth(ctx);
  assertCapability(user, capability);
  return user;
}

/** Actions call this after their membership/access checks (billing permits recovery). */
export function assertCapability(user: { role: UserRole }, capability: Capability) {
  if (!can(user.role, capability)) {
    throw new Error(`Forbidden: This action requires ${capability}`);
  }
}

/** Keep ledger rows usable without disclosing donor identity to restricted readers. */
export function redactDonorFields<T extends { donorName?: string; donorId?: string }>(
  user: Pick<Doc<"users">, "role">,
  row: T
): T {
  if (can(user.role, "donors.read")) return row;
  const redacted = { ...row, donorName: "" };
  const fields = redacted as Record<string, unknown>;
  // Import keys embed the original description, and readers who can't see
  // donors never import, so they never need one.
  delete fields.importKey;
  const hasDonorIdentity = Object.entries(row).some(
    ([key, value]) => /^donor/i.test(key) && Boolean(value)
  ) || Boolean(fields.pledgeId) || fields.isGiftAidEligible === true;
  // Named donation text can retain old identities after renames or merges.
  // Never derive restricted display text from those free-text fields.
  if (hasDonorIdentity) {
    if (typeof fields.description === "string") fields.description = "Donation";
    delete fields.notes;
    delete fields.voidReason;
  }
  // Also strips donor contact projections if a query adds them in future.
  for (const key of Object.keys(redacted)) {
    if (/^donor/i.test(key) && key !== "donorName") {
      delete fields[key];
    }
  }
  return redacted;
}
