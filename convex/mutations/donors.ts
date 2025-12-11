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

    const oldName = donor.name;
    const newName = args.name;

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

    // If name changed, update donorName on related transactions and pledges
    if (newName && newName !== oldName) {
      // Update transactions linked by donorId
      const transactionsByDonorId = await ctx.db
        .query("transactions")
        .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
        .collect();

      for (const t of transactionsByDonorId) {
        await ctx.db.patch(t._id, { donorName: newName });
      }

      // Update transactions linked by old donorName (but no donorId)
      const transactionsByName = await ctx.db
        .query("transactions")
        .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
        .filter((q) => q.and(
          q.eq(q.field("donorName"), oldName),
          q.eq(q.field("donorId"), undefined)
        ))
        .collect();

      for (const t of transactionsByName) {
        await ctx.db.patch(t._id, { donorName: newName, donorId: args.donorId });
      }

      // Update pledges linked by donorId
      const pledgesByDonorId = await ctx.db
        .query("pledges")
        .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
        .collect();

      for (const p of pledgesByDonorId) {
        await ctx.db.patch(p._id, { donorName: newName });
      }

      // Update pledges linked by old donorName (but no donorId)
      const pledgesByName = await ctx.db
        .query("pledges")
        .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
        .filter((q) => q.and(
          q.eq(q.field("donorName"), oldName),
          q.eq(q.field("donorId"), undefined)
        ))
        .collect();

      for (const p of pledgesByName) {
        await ctx.db.patch(p._id, { donorName: newName, donorId: args.donorId });
      }
    }

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

// Link orphaned transactions/pledges by old donor name to a donor
export const linkOrphanedRecords = mutation({
  args: {
    donorId: v.id("donors"),
    oldName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donor = await ctx.db.get(args.donorId);
    if (!donor || donor.organizationId !== user.organizationId) {
      throw new Error("Donor not found");
    }

    let linkedTransactions = 0;
    let linkedPledges = 0;

    // Find transactions with the old name
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
      .filter((q) => q.eq(q.field("donorName"), args.oldName))
      .collect();

    for (const t of transactions) {
      await ctx.db.patch(t._id, { donorName: donor.name, donorId: args.donorId });
      linkedTransactions++;
    }

    // Find pledges with the old name
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
      .filter((q) => q.eq(q.field("donorName"), args.oldName))
      .collect();

    for (const p of pledges) {
      await ctx.db.patch(p._id, { donorName: donor.name, donorId: args.donorId });
      linkedPledges++;
    }

    return { linkedTransactions, linkedPledges };
  },
});

// Helper to normalize donor names for matching
const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|rev|pastor|deacon)\.?\s+/i, "")
    .replace(/\s+/g, " ");
};

// Find or create donor by name (with fuzzy matching)
export const findOrCreate = mutation({
  args: {
    name: v.string(),
    isGiftAidEligible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    if (!args.name || args.name.trim().length < 2) {
      return { donorId: null, isNew: false, matchedName: null };
    }

    const normalized = normalizeName(args.name);

    // Get all donors for fuzzy matching
    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Priority 1: Exact match (normalized)
    let match = donors.find((d) => normalizeName(d.name) === normalized);

    // Priority 2: Contains match
    if (!match) {
      match = donors.find((d) => {
        const donorNormalized = normalizeName(d.name);
        return (
          donorNormalized.includes(normalized) ||
          normalized.includes(donorNormalized)
        );
      });
    }

    // Priority 3: Word-based matching
    if (!match) {
      const inputWords = normalized.split(" ").filter((w) => w.length > 1);
      match = donors.find((d) => {
        const donorWords = normalizeName(d.name).split(" ");
        return inputWords.every((inputWord) =>
          donorWords.some(
            (donorWord) =>
              donorWord.startsWith(inputWord) || inputWord.startsWith(donorWord)
          )
        );
      });
    }

    if (match) {
      return { donorId: match._id, isNew: false, matchedName: match.name };
    }

    // No match found - create new donor
    const donorId = await ctx.db.insert("donors", {
      organizationId: user.organizationId,
      name: args.name.trim(),
      type: "Individual",
      isGiftAidActive: args.isGiftAidEligible ?? false,
      createdAt: Date.now(),
    });

    return { donorId, isNew: true, matchedName: args.name.trim() };
  },
});

// Bulk find or create donors (for import)
export const bulkFindOrCreate = mutation({
  args: {
    donors: v.array(
      v.object({
        name: v.string(),
        isGiftAidEligible: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Get all existing donors once
    const existingDonors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const results: {
      originalName: string;
      donorId: string | null;
      matchedName: string | null;
      isNew: boolean;
    }[] = [];
    const newDonorsCreated = new Map<string, string>(); // normalized name -> donorId

    for (const donor of args.donors) {
      if (!donor.name || donor.name.trim().length < 2) {
        results.push({
          originalName: donor.name,
          donorId: null,
          matchedName: null,
          isNew: false,
        });
        continue;
      }

      const normalized = normalizeName(donor.name);

      // Check if we already created this donor in this batch
      if (newDonorsCreated.has(normalized)) {
        results.push({
          originalName: donor.name,
          donorId: newDonorsCreated.get(normalized)!,
          matchedName: donor.name.trim(),
          isNew: false,
        });
        continue;
      }

      // Try fuzzy matching
      let match = existingDonors.find(
        (d) => normalizeName(d.name) === normalized
      );

      if (!match) {
        match = existingDonors.find((d) => {
          const donorNormalized = normalizeName(d.name);
          return (
            donorNormalized.includes(normalized) ||
            normalized.includes(donorNormalized)
          );
        });
      }

      if (!match) {
        const inputWords = normalized.split(" ").filter((w) => w.length > 1);
        match = existingDonors.find((d) => {
          const donorWords = normalizeName(d.name).split(" ");
          return inputWords.every((inputWord) =>
            donorWords.some(
              (donorWord) =>
                donorWord.startsWith(inputWord) ||
                inputWord.startsWith(donorWord)
            )
          );
        });
      }

      if (match) {
        results.push({
          originalName: donor.name,
          donorId: match._id,
          matchedName: match.name,
          isNew: false,
        });
      } else {
        // Create new donor
        const donorId = await ctx.db.insert("donors", {
          organizationId: user.organizationId,
          name: donor.name.trim(),
          type: "Individual",
          isGiftAidActive: donor.isGiftAidEligible ?? false,
          createdAt: Date.now(),
        });

        newDonorsCreated.set(normalized, donorId);
        results.push({
          originalName: donor.name,
          donorId,
          matchedName: donor.name.trim(),
          isNew: true,
        });
      }
    }

    return results;
  },
});

// Merge duplicate donors into a primary donor
export const merge = mutation({
  args: {
    primaryDonorId: v.id("donors"),
    duplicateDonorIds: v.array(v.id("donors")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Verify primary donor exists and belongs to org
    const primaryDonor = await ctx.db.get(args.primaryDonorId);
    if (!primaryDonor || primaryDonor.organizationId !== user.organizationId) {
      throw new Error("Primary donor not found");
    }

    let mergedTransactions = 0;
    let mergedPledges = 0;
    let deletedDonors = 0;

    for (const duplicateId of args.duplicateDonorIds) {
      if (duplicateId === args.primaryDonorId) continue;

      const duplicateDonor = await ctx.db.get(duplicateId);
      if (!duplicateDonor || duplicateDonor.organizationId !== user.organizationId) {
        continue;
      }

      // Move all transactions from duplicate to primary
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_donor", (q) => q.eq("donorId", duplicateId))
        .collect();

      for (const t of transactions) {
        await ctx.db.patch(t._id, {
          donorId: args.primaryDonorId,
          donorName: primaryDonor.name,
        });
        mergedTransactions++;
      }

      // Also update transactions that match by donorName but have no donorId
      const transactionsByName = await ctx.db
        .query("transactions")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("donorName"), duplicateDonor.name),
            q.eq(q.field("donorId"), undefined)
          )
        )
        .collect();

      for (const t of transactionsByName) {
        await ctx.db.patch(t._id, {
          donorId: args.primaryDonorId,
          donorName: primaryDonor.name,
        });
        mergedTransactions++;
      }

      // Move all pledges from duplicate to primary
      const pledges = await ctx.db
        .query("pledges")
        .withIndex("by_donor", (q) => q.eq("donorId", duplicateId))
        .collect();

      for (const p of pledges) {
        await ctx.db.patch(p._id, {
          donorId: args.primaryDonorId,
          donorName: primaryDonor.name,
        });
        mergedPledges++;
      }

      // Also update pledges that match by donorName but have no donorId
      const pledgesByName = await ctx.db
        .query("pledges")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", user.organizationId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("donorName"), duplicateDonor.name),
            q.eq(q.field("donorId"), undefined)
          )
        )
        .collect();

      for (const p of pledgesByName) {
        await ctx.db.patch(p._id, {
          donorId: args.primaryDonorId,
          donorName: primaryDonor.name,
        });
        mergedPledges++;
      }

      // Merge any useful data from duplicate to primary (if primary lacks it)
      const updates: Record<string, any> = {};
      if (!primaryDonor.email && duplicateDonor.email)
        updates.email = duplicateDonor.email;
      if (!primaryDonor.phone && duplicateDonor.phone)
        updates.phone = duplicateDonor.phone;
      if (!primaryDonor.address && duplicateDonor.address)
        updates.address = duplicateDonor.address;
      if (!primaryDonor.postcode && duplicateDonor.postcode)
        updates.postcode = duplicateDonor.postcode;
      if (!primaryDonor.isGiftAidActive && duplicateDonor.isGiftAidActive)
        updates.isGiftAidActive = true;

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(args.primaryDonorId, updates);
      }

      // Delete the duplicate donor
      await ctx.db.delete(duplicateId);
      deletedDonors++;
    }

    return {
      primaryDonorId: args.primaryDonorId,
      mergedTransactions,
      mergedPledges,
      deletedDonors,
    };
  },
});

// Find potential duplicate donors
export const findDuplicates = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Normalize names for comparison
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .trim()
        .replace(/^(mr|mrs|ms|miss|dr|rev|pastor|deacon)\.?\s+/i, "")
        .replace(/\s+/g, " ");

    // Group donors by normalized name
    const groups = new Map<string, typeof donors>();

    for (const donor of donors) {
      const normalized = normalize(donor.name);

      // Check existing groups for similar names
      let foundGroup = false;
      for (const [key, group] of groups) {
        // Check if names are similar (one contains the other, or word match)
        if (
          key.includes(normalized) ||
          normalized.includes(key) ||
          areSimilarNames(key, normalized)
        ) {
          group.push(donor);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.set(normalized, [donor]);
      }
    }

    // Return only groups with more than 1 donor (duplicates)
    const duplicateGroups: { donors: typeof donors; suggestedPrimary: string }[] = [];

    for (const [, group] of groups) {
      if (group.length > 1) {
        // Suggest the donor with most transactions/pledges as primary
        const donorScores = await Promise.all(
          group.map(async (d) => {
            const txCount = (
              await ctx.db
                .query("transactions")
                .withIndex("by_donor", (q) => q.eq("donorId", d._id))
                .collect()
            ).length;
            const pledgeCount = (
              await ctx.db
                .query("pledges")
                .withIndex("by_donor", (q) => q.eq("donorId", d._id))
                .collect()
            ).length;
            return {
              donor: d,
              score: txCount + pledgeCount * 2, // Weight pledges more
              hasEmail: d.email ? 1 : 0,
              hasPhone: d.phone ? 1 : 0,
            };
          })
        );

        // Sort by score, then by data completeness
        donorScores.sort(
          (a, b) =>
            b.score - a.score ||
            b.hasEmail - a.hasEmail ||
            b.hasPhone - a.hasPhone
        );

        duplicateGroups.push({
          donors: group,
          suggestedPrimary: donorScores[0].donor._id,
        });
      }
    }

    return duplicateGroups;
  },
});

// Helper function to check if names are similar
function areSimilarNames(name1: string, name2: string): boolean {
  const words1 = name1.split(" ").filter((w) => w.length > 1);
  const words2 = name2.split(" ").filter((w) => w.length > 1);

  // Check if all words from one name match start of words in other
  const match1 = words1.every((w1) =>
    words2.some((w2) => w2.startsWith(w1) || w1.startsWith(w2))
  );
  const match2 = words2.every((w2) =>
    words1.some((w1) => w1.startsWith(w2) || w2.startsWith(w1))
  );

  return match1 || match2;
}

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
