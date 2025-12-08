import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export type UserRole = "Admin" | "Finance Team" | "Pastorate" | "Guest";

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
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error("Unauthorized: Please sign in to continue");
  }
  return user;
}

/**
 * Require specific role(s) - throws if not authorized
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: UserRole[]
) {
  const user = await requireAuth(ctx);
  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Forbidden: This action requires one of these roles: ${allowedRoles.join(", ")}`
    );
  }
  return user;
}

/**
 * Check if user can edit (Admin or Finance Team)
 */
export function canEdit(user: Doc<"users">) {
  return user.role === "Admin" || user.role === "Finance Team";
}

/**
 * Check if user is Admin
 */
export function isAdmin(user: Doc<"users">) {
  return user.role === "Admin";
}
