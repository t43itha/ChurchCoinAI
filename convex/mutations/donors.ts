import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Create a new donor
export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    postcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.union(v.literal("Individual"), v.literal("Organization")),
    isGiftAidActive: v.optional(v.boolean()),
    communicationPreference: v.optional(
      v.union(v.literal("Email"), v.literal("Post"), v.literal("Phone"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donorId = await ctx.db.insert("donors", {
      organizationId: user.organizationId,
      name: args.name,
      email: args.email,
      phone: args.phone,
      address: args.address,
      postcode: args.postcode,
      notes: args.notes,
      type: args.type,
      isGiftAidActive: args.isGiftAidActive ?? false,
      communicationPreference: args.communicationPreference,
      createdAt: Date.now(),
    });

    return donorId;
  },
});

// Update a donor
export const update = mutation({
  args: {
    donorId: v.id("donors"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    postcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.optional(v.union(v.literal("Individual"), v.literal("Organization"))),
    isGiftAidActive: v.optional(v.boolean()),
    communicationPreference: v.optional(
      v.union(v.literal("Email"), v.literal("Post"), v.literal("Phone"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donor = await ctx.db.get(args.donorId);
    if (!donor || donor.organizationId !== user.organizationId) {
      throw new Error("Donor not found");
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.email !== undefined) updates.email = args.email;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.address !== undefined) updates.address = args.address;
    if (args.postcode !== undefined) updates.postcode = args.postcode;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.type !== undefined) updates.type = args.type;
    if (args.isGiftAidActive !== undefined)
      updates.isGiftAidActive = args.isGiftAidActive;
    if (args.communicationPreference !== undefined)
      updates.communicationPreference = args.communicationPreference;

    await ctx.db.patch(args.donorId, updates);

    return args.donorId;
  },
});

// Bulk upsert donors (for CSV import)
export const bulkUpsert = mutation({
  args: {
    donors: v.array(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        address: v.optional(v.string()),
        postcode: v.optional(v.string()),
        type: v.optional(v.union(v.literal("Individual"), v.literal("Organization"))),
        isGiftAidActive: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const results: { id: string; name: string; isNew: boolean }[] = [];

    for (const donor of args.donors) {
      // Check if donor exists by name
      const existing = await ctx.db
        .query("donors")
        .withIndex("by_organization_name", (q) =>
          q.eq("organizationId", user.organizationId).eq("name", donor.name)
        )
        .first();

      if (existing) {
        // Update existing donor
        const updates: Record<string, any> = {};
        if (donor.email) updates.email = donor.email;
        if (donor.phone) updates.phone = donor.phone;
        if (donor.address) updates.address = donor.address;
        if (donor.postcode) updates.postcode = donor.postcode;
        if (donor.type) updates.type = donor.type;
        if (donor.isGiftAidActive !== undefined)
          updates.isGiftAidActive = donor.isGiftAidActive;

        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(existing._id, updates);
        }

        results.push({ id: existing._id, name: donor.name, isNew: false });
      } else {
        // Create new donor
        const donorId = await ctx.db.insert("donors", {
          organizationId: user.organizationId,
          name: donor.name,
          email: donor.email,
          phone: donor.phone,
          address: donor.address,
          postcode: donor.postcode,
          type: donor.type ?? "Individual",
          isGiftAidActive: donor.isGiftAidActive ?? false,
          createdAt: Date.now(),
        });

        results.push({ id: donorId, name: donor.name, isNew: true });
      }
    }

    return results;
  },
});

// Delete a donor
export const remove = mutation({
  args: {
    donorId: v.id("donors"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    const donor = await ctx.db.get(args.donorId);
    if (!donor || donor.organizationId !== user.organizationId) {
      throw new Error("Donor not found");
    }

    // Note: We don't delete associated transactions/pledges,
    // just remove the donorId reference
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    for (const t of transactions) {
      await ctx.db.patch(t._id, { donorId: undefined });
    }

    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    for (const p of pledges) {
      await ctx.db.patch(p._id, { donorId: undefined });
    }

    await ctx.db.delete(args.donorId);

    return args.donorId;
  },
});
