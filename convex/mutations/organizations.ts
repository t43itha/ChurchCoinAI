import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getIdentity, requireAuth, isAdmin } from "../lib/auth";

// Default categories for new organizations
const DEFAULT_CATEGORIES = [
  "Tithe",
  "Donations",
  "Grants",
  "Fundraising",
  "Investment Income",
  "Gift Aid",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Ministry",
  "Mission Giving",
  "Administration",
  "Sundries",
];

// Create a new organization (onboarding)
export const create = mutation({
  args: {
    name: v.string(),
    charityNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    reportingPeriod: v.optional(
      v.union(v.literal("tax_year"), v.literal("calendar_year"))
    ),
    logoUrl: v.optional(v.string()),
    userName: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    if (!identity) {
      throw new Error("Must be signed in to create an organization");
    }

    // Check if user already has an organization
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existingUser) {
      throw new Error("User already belongs to an organization");
    }

    // Create the organization
    const organizationId = await ctx.db.insert("organizations", {
      name: args.name,
      charityNumber: args.charityNumber,
      address: args.address,
      email: args.email,
      website: args.website,
      reportingPeriod: args.reportingPeriod ?? "tax_year",
      logoUrl: args.logoUrl,
      createdAt: Date.now(),
      createdBy: identity.subject,
    });

    // Create the user as Admin
    await ctx.db.insert("users", {
      clerkId: identity.subject,
      organizationId,
      name: args.userName,
      email: args.userEmail,
      role: "Admin",
      createdAt: Date.now(),
    });

    // Create default categories
    for (const categoryName of DEFAULT_CATEGORIES) {
      await ctx.db.insert("categories", {
        organizationId,
        name: categoryName,
        createdAt: Date.now(),
      });
    }

    // Create default General Fund
    await ctx.db.insert("funds", {
      organizationId,
      name: "General Fund",
      type: "Unrestricted",
      description: "Main unrestricted fund for general operations",
      createdAt: Date.now(),
    });

    return organizationId;
  },
});

// Update organization details
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    charityNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    reportingPeriod: v.optional(
      v.union(v.literal("tax_year"), v.literal("calendar_year"))
    ),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (!isAdmin(user)) {
      throw new Error("Only admins can update organization settings");
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.charityNumber !== undefined)
      updates.charityNumber = args.charityNumber;
    if (args.address !== undefined) updates.address = args.address;
    if (args.email !== undefined) updates.email = args.email;
    if (args.website !== undefined) updates.website = args.website;
    if (args.reportingPeriod !== undefined)
      updates.reportingPeriod = args.reportingPeriod;
    if (args.logoUrl !== undefined) updates.logoUrl = args.logoUrl;

    await ctx.db.patch(user.organizationId, updates);

    return user.organizationId;
  },
});
