import { mutation, type MutationCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";
import { requireCapability } from "../lib/auth";
import { Doc, Id } from "../_generated/dataModel";
import { roundMoney } from "../lib/money";
import {
  assertValidTransactionAmount,
  assertValidTransactionDate,
} from "../lib/transactionValidation";
import {
  ensureTypedCategories,
  requireCanonicalCategory,
} from "../lib/categoryIntegrity";
import { resolveCategoryForTransaction } from "../intelligence/categorization/categoryResolver";
import { isMovementCategory } from "../../lib/movementCategories";
import { isNamedDonationTransaction } from "../../lib/inPersonGiving";
import { assertNotLockedByReconciliation, deleteTransaction, patchTransaction } from "../lib/transactionWrites";

// Helper to normalize donor names for matching
const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|rev|pastor|deacon)\.?\s+/i, "")
    .replace(/\s+/g, " ");
};

const validNamedDonationPaymentMethods = new Set(["Cash", "Cheque", "Card"]);

const positiveAmount = (amount: number) => {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return null;
  assertValidTransactionAmount(rounded);
  return rounded;
};

async function assertCollectionUnlocked(
  ctx: MutationCtx,
  collection: Doc<"cashCollections">
) {
  await assertNotLockedByReconciliation(ctx, {
    organizationId: collection.organizationId,
    cashCollectionId: collection._id,
  });
  if (
    collection.status === "banked" ||
    collection.cashBankingStatus === "banked" ||
    collection.cashBankingStatus === "partially_banked" ||
    collection.cashBankingLastReconciliationId
  ) {
    throw new Error("Cannot change a collection that has been banked");
  }

  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_cashCollection", (q) =>
      q.eq("cashCollectionId", collection._id)
    )
    .collect();
  const orgTransactions = transactions.filter(
    (transaction) => transaction.organizationId === collection.organizationId
  );
  if (
    orgTransactions.some(
      (transaction) =>
        transaction.cashBankingReconciliationId ||
        transaction.cashBankingRole ||
        transaction.reconciliationSessionId
    )
  ) {
    throw new Error("Cannot change a collection that has been banked");
  }
  return orgTransactions;
}

const serviceRowValidator = v.object({
  serviceDate: v.string(),
  serviceNote: v.string(),
  fundId: v.id("funds"),
  category: v.optional(v.string()),
  programmeId: v.optional(v.id("programmes")),
  cash: v.number(),
  pdq: v.number(),
  cheque: v.number(),
});

const namedDonationValidator = v.object({
  donorName: v.string(),
  donorId: v.optional(v.id("donors")),
  category: v.string(),
  fundId: v.id("funds"),
  paymentMethod: v.union(
    v.literal("Cash"),
    v.literal("Cheque"),
    v.literal("Card")
  ),
  amount: v.number(),
  isGiftAidEligible: v.boolean(),
  serviceDate: v.optional(v.string()),
  serviceNote: v.optional(v.string()),
});

type ServiceRowInput = Infer<typeof serviceRowValidator>;
type NamedDonationInput = Infer<typeof namedDonationValidator>;

function filterValidEntries({
  serviceRows,
  namedDonations = [],
}: {
  serviceRows: ServiceRowInput[];
  namedDonations?: NamedDonationInput[];
}) {
  const validRows = serviceRows.filter(
    (row) => row.serviceDate && row.fundId && row.cash + row.pdq + row.cheque > 0
  );
  const validNamedDonations = namedDonations.filter(
    (donation) =>
      donation.donorName.trim().length >= 2 &&
      donation.fundId &&
      donation.amount > 0 &&
      donation.category.trim().length > 0 &&
      validNamedDonationPaymentMethods.has(donation.paymentMethod)
  );

  if (validRows.length === 0 && validNamedDonations.length === 0) {
    throw new Error("Please add at least one service row or named donation with an amount.");
  }

  return { validRows, validNamedDonations };
}

async function loadOrganizationFund(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  fundId: Id<"funds">
) {
  const fund = await ctx.db.get(fundId);
  if (!fund || fund.organizationId !== organizationId) {
    throw new Error(`Invalid fund: ${fundId}`);
  }
  return fund;
}

async function resolveProgrammeId(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  programmeId: Id<"programmes"> | undefined
) {
  if (!programmeId) return undefined;
  const programme = await ctx.db.get(programmeId);
  if (!programme || programme.organizationId !== organizationId) {
    throw new Error("Invalid programme");
  }
  return programme._id;
}

// Find or create donor by name (internal helper)
async function findOrCreateDonor(
  ctx: any,
  organizationId: Id<"organizations">,
  name: string,
  isGiftAidEligible: boolean
): Promise<{ donorId: Id<"donors">; matchedName: string; isNew: boolean }> {
  if (!name || name.trim().length < 2) {
    throw new Error("Donor name is required");
  }

  const normalized = normalizeName(name);

  const donors = await ctx.db
    .query("donors")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId)
    )
    .collect();

  // Priority 1: Exact match (normalized)
  let match = donors.find((d: any) => normalizeName(d.name) === normalized);

  // Priority 2: Contains match
  if (!match) {
    match = donors.find((d: any) => {
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
    match = donors.find((d: any) => {
      const donorWords = normalizeName(d.name).split(" ");
      return inputWords.every((inputWord) =>
        donorWords.some(
          (donorWord: string) =>
            donorWord.startsWith(inputWord) || inputWord.startsWith(donorWord)
        )
      );
    });
  }

  if (match) {
    return { donorId: match._id, matchedName: match.name, isNew: false };
  }

  // No match found - create new donor
  const donorId = await ctx.db.insert("donors", {
    organizationId,
    name: name.trim(),
    type: "Individual",
    isGiftAidActive: isGiftAidEligible,
    createdAt: Date.now(),
  });

  return { donorId, matchedName: name.trim(), isNew: true };
}

// Entries are deleted and re-inserted on edit, so an entry may keep a retired
// category only if an entry of the same kind and fund already had it.
type EntryKind = "service" | "donation";
const retainedCategoryKey = (kind: EntryKind, fundId: Id<"funds">, category: string) =>
  `${kind}:${fundId}:${category}`;

function retainedCategoryKeys(transactions: Doc<"transactions">[]) {
  return new Set(
    transactions
      .filter((transaction) => transaction.fundId)
      .map((transaction) =>
        retainedCategoryKey(
          isNamedDonationTransaction(transaction) ? "donation" : "service",
          transaction.fundId!,
          transaction.category
        )
      )
  );
}

// Clients from before entryFormat 2 send no categories, programmes or
// donation dates, so their edits would silently erase them.
function legacyEditWouldDropDetail(
  transactions: Doc<"transactions">[],
  weekEndingDate: string
) {
  return transactions.some((transaction) =>
    isNamedDonationTransaction(transaction)
      ? transaction.notes?.startsWith("service:") || transaction.date !== weekEndingDate
      : transaction.programmeId !== undefined || transaction.category !== "Offerings"
  );
}

function serviceRowDefaultCategory(
  categories: Doc<"categories">[],
  defaultIncomeCategory: string | undefined
): string {
  const defaultName = defaultIncomeCategory?.trim();
  if (!defaultName) return "Offerings";
  const resolved = resolveCategoryForTransaction(defaultName, "Income", categories);
  return resolved && !resolved.isRetired && !isMovementCategory(resolved) ? defaultName : "Offerings";
}

async function insertCollectionEntries(
  ctx: MutationCtx,
  {
    organizationId,
    cashCollectionId,
    weekEndingDate,
    serviceRows,
    namedDonations,
    retainedCategories,
  }: {
    organizationId: Id<"organizations">;
    cashCollectionId: Id<"cashCollections">;
    weekEndingDate: string;
    serviceRows: ServiceRowInput[];
    namedDonations: NamedDonationInput[];
    retainedCategories?: Set<string>;
  }
): Promise<Id<"transactions">[]> {
  const categories = await ensureTypedCategories(ctx, organizationId);
  const transactionIds: Id<"transactions">[] = [];

  for (const row of serviceRows) {
    const fund = await loadOrganizationFund(ctx, organizationId, row.fundId);
    const requested =
      row.category?.trim() || serviceRowDefaultCategory(categories, fund.defaultIncomeCategory);
    const { category, movementKind } = requireCanonicalCategory(
      categories,
      requested,
      "Income",
      {
        cashCollectionId,
        currentCategory: retainedCategories?.has(retainedCategoryKey("service", row.fundId, requested))
          ? requested
          : undefined,
      }
    );
    const programmeId = await resolveProgrammeId(ctx, organizationId, row.programmeId);
    const serviceNote = row.serviceNote.trim() || "Service";

    const methods = [
      { label: "Cash", amount: row.cash, paymentMethod: "Cash" as const },
      { label: "PDQ", amount: row.pdq, paymentMethod: "Card" as const },
      { label: "Cheque", amount: row.cheque, paymentMethod: "Cheque" as const },
    ];

    for (const method of methods) {
      const amount = positiveAmount(method.amount);
      if (amount === null) continue;
      assertValidTransactionDate(row.serviceDate);

      const transactionId = await ctx.db.insert("transactions", {
        organizationId,
        date: row.serviceDate,
        description: `${serviceNote} - ${method.label}`,
        amount,
        type: "Income",
        category,
        movementKind,
        fundId: row.fundId,
        isReconciled: false,
        paymentMethod: method.paymentMethod,
        cashCollectionId,
        notes: `service:${serviceNote}`,
        programmeId,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);
    }
  }

  for (const donation of namedDonations) {
    await loadOrganizationFund(ctx, organizationId, donation.fundId);

    let donorId: Id<"donors">;
    let matchedName: string;

    if (donation.donorId) {
      const donor = await ctx.db.get(donation.donorId);
      if (!donor || donor.organizationId !== organizationId) {
        throw new Error("Invalid donor");
      }
      donorId = donor._id;
      matchedName = donor.name;
    } else {
      const donorMatch = await findOrCreateDonor(
        ctx,
        organizationId,
        donation.donorName,
        donation.isGiftAidEligible
      );
      donorId = donorMatch.donorId;
      matchedName = donorMatch.matchedName;
    }

    const requestedCategory = donation.category.trim();
    const { category, movementKind } = requireCanonicalCategory(
      categories,
      requestedCategory,
      "Income",
      {
        cashCollectionId,
        currentCategory: retainedCategories?.has(
          retainedCategoryKey("donation", donation.fundId, requestedCategory)
        )
          ? requestedCategory
          : undefined,
      }
    );
    const amount = positiveAmount(donation.amount);
    if (amount === null) {
      throw new Error("Transaction amount must be greater than 0");
    }
    const serviceDate = donation.serviceDate || weekEndingDate;
    assertValidTransactionDate(serviceDate);
    const serviceNote = donation.serviceNote?.trim();

    const transactionId = await ctx.db.insert("transactions", {
      organizationId,
      date: serviceDate,
      description: `${category} - ${matchedName}`,
      amount,
      type: "Income",
      category,
      movementKind,
      fundId: donation.fundId,
      isReconciled: false,
      paymentMethod: donation.paymentMethod,
      cashCollectionId,
      donorId,
      donorName: matchedName,
      isGiftAidEligible: donation.isGiftAidEligible,
      notes: serviceNote ? `service:${serviceNote}` : undefined,
      createdAt: Date.now(),
    });

    transactionIds.push(transactionId);
  }

  return transactionIds;
}

export const submitCollection = mutation({
  args: {
    weekEndingDate: v.string(),
    collectionDate: v.string(),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("submitted"))),
    serviceRows: v.array(serviceRowValidator),
    namedDonations: v.optional(v.array(namedDonationValidator)),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "cashCollections.write");
    const { validRows, validNamedDonations } = filterValidEntries(args);

    const cashCollectionId = await ctx.db.insert("cashCollections", {
      organizationId: user.organizationId,
      weekEndingDate: args.weekEndingDate,
      collectionDate: args.collectionDate,
      recordedAt: Date.now(),
      recordedBy: user._id,
      notes: args.notes,
      status: args.status || "submitted",
      createdAt: Date.now(),
    });

    const transactionIds = await insertCollectionEntries(ctx, {
      organizationId: user.organizationId,
      cashCollectionId,
      weekEndingDate: args.weekEndingDate,
      serviceRows: validRows,
      namedDonations: validNamedDonations,
    });

    return {
      cashCollectionId,
      transactionCount: transactionIds.length,
      transactionIds,
    };
  },
});

export const replaceCollectionEntries = mutation({
  args: {
    cashCollectionId: v.id("cashCollections"),
    weekEndingDate: v.string(),
    collectionDate: v.string(),
    notes: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("submitted")),
    serviceRows: v.array(serviceRowValidator),
    namedDonations: v.optional(v.array(namedDonationValidator)),
    entryFormat: v.optional(v.literal(2)),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "cashCollections.write");

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      throw new Error("Cash collection not found");
    }

    const existingTransactions = await assertCollectionUnlocked(ctx, collection);
    if (
      args.entryFormat !== 2 &&
      legacyEditWouldDropDetail(existingTransactions, collection.weekEndingDate)
    ) {
      throw new Error("This collection has details this page can't edit. Refresh the page and try again.");
    }
    const { validRows, validNamedDonations } = filterValidEntries(args);
    // An outdated page can only be editing Offerings rows (checked above), so
    // its rows stay Offerings rather than taking the fund's current default.
    const serviceRows =
      args.entryFormat === 2
        ? validRows
        : validRows.map((row) => ({ ...row, category: row.category ?? "Offerings" }));

    const retainedCategories = retainedCategoryKeys(existingTransactions);
    for (const transaction of existingTransactions) {
      await deleteTransaction(ctx, transaction._id, { lockOverride: "reconciliation-owner" });
    }

    await ctx.db.patch(args.cashCollectionId, {
      weekEndingDate: args.weekEndingDate,
      collectionDate: args.collectionDate,
      notes: args.notes,
      status: args.status,
    });

    const transactionIds = await insertCollectionEntries(ctx, {
      organizationId: user.organizationId,
      cashCollectionId: args.cashCollectionId,
      weekEndingDate: args.weekEndingDate,
      serviceRows,
      namedDonations: validNamedDonations,
      retainedCategories,
    });

    return {
      cashCollectionId: args.cashCollectionId,
      transactionCount: transactionIds.length,
    };
  },
});

// Mark a collection as banked
export const markAsBanked = mutation({
  args: {
    cashCollectionId: v.id("cashCollections"),
    bankedDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "cashCollections.write");

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      throw new Error("Cash collection not found");
    }

    if (collection.status === "banked") {
      throw new Error("Collection is already marked as banked");
    }

    await assertNotLockedByReconciliation(ctx, {
      organizationId: collection.organizationId,
      cashCollectionId: collection._id,
    });

    // Also mark all linked transactions as reconciled
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_cashCollection", (q) =>
        q.eq("cashCollectionId", args.cashCollectionId)
      )
      .collect();

    for (const t of transactions) {
      await assertNotLockedByReconciliation(ctx, t);
    }
    await ctx.db.patch(args.cashCollectionId, {
      status: "banked",
      bankedDate: args.bankedDate,
    });
    for (const t of transactions) {
      await patchTransaction(ctx, t, { isReconciled: true });
    }

    return {
      cashCollectionId: args.cashCollectionId,
      reconciledTransactions: transactions.length,
    };
  },
});

// Delete a draft cash collection and all its transactions
export const deleteCollection = mutation({
  args: {
    cashCollectionId: v.id("cashCollections"),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "cashCollections.delete");

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      throw new Error("Cash collection not found");
    }

    const transactions = await assertCollectionUnlocked(ctx, collection);

    for (const t of transactions) {
      await deleteTransaction(ctx, t._id, { lockOverride: "reconciliation-owner" });
    }

    // Delete the collection
    await ctx.db.delete(args.cashCollectionId);

    return {
      deletedTransactions: transactions.length,
    };
  },
});
