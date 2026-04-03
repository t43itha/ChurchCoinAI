# Monthly Reporting Category & Calculation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix transaction category mismatches so monthly reports group correctly under RCI categories, Mission Tithe only includes General Fund donations, and Cash Takings uses canonical RCI names.

**Architecture:** Update the RCI constants with an alias map, fix Cash Takings to use canonical category names, rewrite report grouping to use DB `mainCategory` with fund-based fallback for "Donation" transactions, scope Mission Tithe to Unrestricted fund only, and provide a one-time data migration mutation.

**Tech Stack:** React 19, TypeScript, Convex (serverless backend), Tailwind CSS

---

### Task 1: Update RCI Category Constants

**Files:**
- Modify: `constants/rciCategories.ts:4-5` (fix "Offering" → "Offerings")
- Modify: `constants/rciCategories.ts` (add CATEGORY_ALIASES export)

- [ ] **Step 1: Fix the Donations subcategory name**

In `constants/rciCategories.ts`, change line 5:

```typescript
// Before:
"Donations": ["Tithes & First Fruits", "Offering", "Thanksgiving"],

// After:
"Donations": ["Tithes & First Fruits", "Offerings", "Thanksgiving"],
```

- [ ] **Step 2: Add the CATEGORY_ALIASES map**

Add after line 8 (after `RCI_INCOME_CATEGORIES`), before `RCI_EXPENDITURE_CATEGORIES`:

```typescript
// Alias map: maps legacy/variant category names to canonical RCI names.
// Used by data migration and as a fallback in report grouping.
export const CATEGORY_ALIASES: Record<string, string> = {
  "Tithe": "Tithes & First Fruits",
  "Tithes": "Tithes & First Fruits",
  "First Fruit": "Tithes & First Fruits",
  "Offering": "Offerings",
  "Books": "Merchandise",
  "Other": "Uncategorised",
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `rciCategories.ts`

- [ ] **Step 4: Commit**

```bash
git add constants/rciCategories.ts
git commit -m "fix: update RCI categories - rename Offering to Offerings, add alias map"
```

---

### Task 2: Update Cash Takings Mutation (Backend)

**Files:**
- Modify: `convex/mutations/cashCollections.ts:87-103` (contribution type union)
- Modify: `convex/mutations/cashCollections.ts:172-181` (fund logic for Donation type)

- [ ] **Step 1: Update the contribution type union**

In `convex/mutations/cashCollections.ts`, replace lines 93-99:

```typescript
// Before:
        type: v.union(
          v.literal("Tithe"),
          v.literal("Pledge"),
          v.literal("First Fruit"),
          v.literal("Thanksgiving"),
          v.literal("Offering")
        ),

// After:
        type: v.union(
          v.literal("Tithes & First Fruits"),
          v.literal("Donation"),
          v.literal("Offerings"),
          v.literal("Thanksgiving")
        ),
```

- [ ] **Step 2: Update the fund selection logic for Donation type**

Replace lines 172-181:

```typescript
// Before:
      // Determine the fund: pledges use their specified fund, others use unrestricted
      let transactionFundId = unrestrictedFund._id;
      if (contribution.type === "Pledge" && contribution.fundId) {
        // Verify fund belongs to organization
        const pledgeFund = await ctx.db.get(contribution.fundId);
        if (!pledgeFund || pledgeFund.organizationId !== user.organizationId) {
          throw new Error(`Invalid fund for pledge: ${contribution.fundId}`);
        }
        transactionFundId = contribution.fundId;
      }

// After:
      // Determine the fund: Donations use their specified fund, others use unrestricted
      let transactionFundId = unrestrictedFund._id;
      if (contribution.type === "Donation" && contribution.fundId) {
        const donationFund = await ctx.db.get(contribution.fundId);
        if (!donationFund || donationFund.organizationId !== user.organizationId) {
          throw new Error(`Invalid fund for donation: ${contribution.fundId}`);
        }
        transactionFundId = contribution.fundId;
      }
```

- [ ] **Step 3: Update the fundId arg comment**

Change line 100:

```typescript
// Before:
        fundId: v.optional(v.id("funds")), // Required for Pledge type

// After:
        fundId: v.optional(v.id("funds")), // Required for Donation type
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors in `CashTakingsEntry.tsx` (expected — old types still referenced there). No errors in `cashCollections.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add convex/mutations/cashCollections.ts
git commit -m "fix: update cash collection contribution types to canonical RCI names"
```

---

### Task 3: Update Cash Takings Frontend

**Files:**
- Modify: `components/CashTakingsEntry.tsx:33` (ContributionType)
- Modify: `components/CashTakingsEntry.tsx:42` (fundId comment)
- Modify: `components/CashTakingsEntry.tsx:98` (default contribution type)
- Modify: `components/CashTakingsEntry.tsx:101` (default category total)
- Modify: `components/CashTakingsEntry.tsx:146` (addContribution default)
- Modify: `components/CashTakingsEntry.tsx:200-206` (validation logic)
- Modify: `components/CashTakingsEntry.tsx:378-391` (type dropdown options)
- Modify: `components/CashTakingsEntry.tsx:399-418` (fund select condition)
- Modify: `components/CashTakingsEntry.tsx:556-570` (category totals dropdown)

- [ ] **Step 1: Update ContributionType**

Line 33:

```typescript
// Before:
type ContributionType = 'Tithe' | 'Pledge' | 'First Fruit' | 'Thanksgiving' | 'Offering';

// After:
type ContributionType = 'Tithes & First Fruits' | 'Donation' | 'Offerings' | 'Thanksgiving';
```

- [ ] **Step 2: Update fundId comment**

Line 42:

```typescript
// Before:
  fundId?: string; // Required when type='Pledge'

// After:
  fundId?: string; // Required when type='Donation'
```

- [ ] **Step 3: Update default contribution entries**

Line 98 (initial state):

```typescript
// Before:
    { id: generateId(), donorName: "", donorId: null, amount: "", isGiftAidEligible: false, type: 'Tithe', paymentMethod: "Cash" },

// After:
    { id: generateId(), donorName: "", donorId: null, amount: "", isGiftAidEligible: false, type: 'Tithes & First Fruits', paymentMethod: "Cash" },
```

Line 101 (default category total):

```typescript
// Before:
    { id: generateId(), category: "Offering", fundId: "", amount: "", paymentMethod: "Cash" },

// After:
    { id: generateId(), category: "Offerings", fundId: "", amount: "", paymentMethod: "Cash" },
```

Line 146 (addContribution):

```typescript
// Before:
    { id: generateId(), donorName: "", donorId: null, amount: "", isGiftAidEligible: false, type: 'Tithe', paymentMethod: "Cash" },

// After:
    { id: generateId(), donorName: "", donorId: null, amount: "", isGiftAidEligible: false, type: 'Tithes & First Fruits', paymentMethod: "Cash" },
```

- [ ] **Step 4: Update validation logic**

Lines 200-206:

```typescript
// Before:
      const validContributions = namedContributions.filter((t) => {
        const hasBasics = t.donorName && parseFloat(t.amount) > 0;
        // Pledges require a fund selection
        if (t.type === 'Pledge' && !t.fundId) return false;
        return hasBasics;
      });

// After:
      const validContributions = namedContributions.filter((t) => {
        const hasBasics = t.donorName && parseFloat(t.amount) > 0;
        // Donations require a fund selection
        if (t.type === 'Donation' && !t.fundId) return false;
        return hasBasics;
      });
```

- [ ] **Step 5: Update the type dropdown options**

Replace lines 378-391 (the select element content):

```tsx
// Before:
                        <select
                          value={contribution.type}
                          onChange={(e) => updateContribution(contribution.id, {
                            type: e.target.value as ContributionType,
                            fundId: e.target.value === 'Pledge' ? contribution.fundId : undefined
                          })}
                          className="w-full h-9 pl-2 pr-7 text-sm bg-white border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                        >
                          <option value="Tithe">Tithe</option>
                          <option value="Pledge">Pledge</option>
                          <option value="First Fruit">First Fruit</option>
                          <option value="Thanksgiving">Thanksgiving</option>
                          <option value="Offering">Offering</option>
                        </select>

// After:
                        <select
                          value={contribution.type}
                          onChange={(e) => updateContribution(contribution.id, {
                            type: e.target.value as ContributionType,
                            fundId: e.target.value === 'Donation' ? contribution.fundId : undefined
                          })}
                          className="w-full h-9 pl-2 pr-7 text-sm bg-white border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                        >
                          <option value="Tithes & First Fruits">Tithes & First Fruits</option>
                          <option value="Donation">Donation</option>
                          <option value="Offerings">Offerings</option>
                          <option value="Thanksgiving">Thanksgiving</option>
                        </select>
```

- [ ] **Step 6: Update the fund select condition**

Replace lines 399-418 (the fund select block):

```tsx
// Before:
                    {contribution.type === 'Pledge' && (

// After:
                    {contribution.type === 'Donation' && (
```

And update the fund dropdown to show all non-unrestricted funds (line 409-411 remains the same — `restrictedFunds` is already filtered correctly).

- [ ] **Step 7: Update the category totals dropdown**

Replace lines 557-570:

```tsx
// Before:
                        <select
                          value={cat.category}
                          onChange={(e) => updateCategory(cat.id, { category: e.target.value })}
                          className="w-full h-9 pl-3 pr-8 text-sm bg-white border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                        >
                          <option value="">Select category...</option>
                          <option value="Tithe">Tithe</option>
                          <option value="Offering">Offering</option>
                          <option value="Merchandise">Merchandise</option>
                          <option value="Books">Books</option>
                          <option value="Other">Other</option>
                          <option value="Thanksgiving">Thanksgiving</option>
                          <option value="First Fruit">First Fruit</option>
                        </select>

// After:
                        <select
                          value={cat.category}
                          onChange={(e) => updateCategory(cat.id, { category: e.target.value })}
                          className="w-full h-9 pl-3 pr-8 text-sm bg-white border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                        >
                          <option value="">Select category...</option>
                          <option value="Offerings">Offerings</option>
                          <option value="Thanksgiving">Thanksgiving</option>
                          <option value="Merchandise">Merchandise</option>
                          <option value="Uncategorised">Uncategorised</option>
                        </select>
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add components/CashTakingsEntry.tsx
git commit -m "fix: update Cash Takings to use canonical RCI category names"
```

---

### Task 4: Rewrite Report Grouping Logic

**Files:**
- Modify: `convex/queries/reports.ts:1-27` (remove isDonationCategory, isTitheCategory, add imports)
- Modify: `convex/queries/reports.ts:336-575` (monthlyReportData query)
- Modify: `convex/queries/reports.ts:136-143` (weeklyCashSummary tithe filter)

- [ ] **Step 1: Replace helper functions with new imports and helpers**

Replace lines 1-27 of `convex/queries/reports.ts`:

```typescript
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { CATEGORY_ALIASES, INCOME_MAIN_CATEGORY_ORDER } from "../../constants/rciCategories";

// Mission Tithe eligible categories (canonical names only)
const MISSION_TITHE_CATEGORIES = new Set([
  "Offerings",
  "Tithes & First Fruits",
  "Thanksgiving",
]);

// Resolve a category name to its canonical RCI name using the alias map
const resolveCategory = (category: string): string => {
  return CATEGORY_ALIASES[category] ?? category;
};
```

- [ ] **Step 2: Update the monthlyReportData query — category lookup with alias fallback and fund-based grouping**

Replace lines 362-395 (the category lookup build + income grouping) inside `monthlyReportData`:

```typescript
    // Get categories with mainCategory data
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Get funds for Mission Tithe fund-type filtering and Donation grouping
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const fundMap = new Map(funds.map((f) => [f._id, f]));

    // Build category to mainCategory lookup
    const categoryToMain = new Map<string, string>();
    for (const cat of categories) {
      categoryToMain.set(cat.name, cat.mainCategory || "Other");
    }

    // Resolve mainCategory for a transaction, with alias fallback and fund-based grouping
    const getMainCategory = (
      category: string,
      fundId: any,
      transactionType: "Income" | "Expenditure"
    ): string => {
      // 1. Direct DB lookup
      let mainCategory = categoryToMain.get(category);

      // 2. Alias fallback: resolve variant name, then look up again
      if (!mainCategory) {
        const canonical = resolveCategory(category);
        mainCategory = categoryToMain.get(canonical);
      }

      // 3. Special case for "Donation": group by fund
      if (category === "Donation" && fundId) {
        const fund = fundMap.get(fundId);
        if (fund) {
          // If the fund name matches an RCI main category, use it
          if (INCOME_MAIN_CATEGORY_ORDER.includes(fund.name)) {
            return fund.name;
          }
          // If unrestricted, group under Donations
          if (fund.type === "Unrestricted") {
            return "Donations";
          }
          // For other fund types, use fund name as main category
          return fund.name;
        }
      }

      // 4. Return found mainCategory or fallback
      if (mainCategory) return mainCategory;
      return transactionType === "Income" ? "Other Income" : "Admin & Governance";
    };

    // Separate income and expenditure
    const incomeTransactions = allTransactions.filter((t) => t.type === "Income");
    const expenditureTransactions = allTransactions.filter((t) => t.type === "Expenditure");

    // Group income by mainCategory
    const receiptsMap = new Map<string, { subcategories: Map<string, number>; total: number }>();
    for (const t of incomeTransactions) {
      const mainCategory = getMainCategory(t.category, t.fundId, "Income");

      if (!receiptsMap.has(mainCategory)) {
        receiptsMap.set(mainCategory, { subcategories: new Map(), total: 0 });
      }
      const group = receiptsMap.get(mainCategory)!;
      group.subcategories.set(t.category, (group.subcategories.get(t.category) || 0) + t.amount);
      group.total += t.amount;
    }

    // Group expenditure by mainCategory
    const paymentsMap = new Map<string, { subcategories: Map<string, number>; total: number }>();
    for (const t of expenditureTransactions) {
      const mainCategory = getMainCategory(t.category, t.fundId, "Expenditure");

      if (!paymentsMap.has(mainCategory)) {
        paymentsMap.set(mainCategory, { subcategories: new Map(), total: 0 });
      }
      const group = paymentsMap.get(mainCategory)!;
      group.subcategories.set(t.category, (group.subcategories.get(t.category) || 0) + t.amount);
      group.total += t.amount;
    }
```

- [ ] **Step 3: Rewrite Mission Tithe to scope to Unrestricted fund**

Replace lines 494-528 (Mission Tithe breakdown):

```typescript
    // Mission Tithe breakdown (10% of Offerings + Tithes & First Fruits + Thanksgiving in General Fund only)
    const missionTitheBreakdown = sundays.map((weekEnding) => {
      const weekStart = new Date(weekEnding);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      const weekDonations = incomeTransactions.filter((t) => {
        if (t.date < weekStartStr || t.date > weekEnding) return false;
        const resolved = resolveCategory(t.category);
        if (!MISSION_TITHE_CATEGORIES.has(resolved)) return false;
        const fund = fundMap.get(t.fundId);
        return fund?.type === "Unrestricted";
      });

      const total = weekDonations.reduce((sum, t) => sum + t.amount, 0);

      return { weekEnding, total };
    });

    // Add partial-week row for donation days after the last Sunday
    if (lastSunday && lastSunday < endDateStr) {
      const dayAfterLastSunday = new Date(lastSunday);
      dayAfterLastSunday.setDate(dayAfterLastSunday.getDate() + 1);
      const partialStartStr = dayAfterLastSunday.toISOString().split("T")[0];

      const partialWeekDonations = incomeTransactions.filter((t) => {
        if (t.date < partialStartStr || t.date > endDateStr) return false;
        const resolved = resolveCategory(t.category);
        if (!MISSION_TITHE_CATEGORIES.has(resolved)) return false;
        const fund = fundMap.get(t.fundId);
        return fund?.type === "Unrestricted";
      });
      const partialTotal = partialWeekDonations.reduce((sum, t) => sum + t.amount, 0);

      if (partialTotal > 0) {
        missionTitheBreakdown.push({ weekEnding: endDateStr, total: partialTotal });
      }
    }

    // Compute total from ALL month's Mission Tithe eligible donations
    const missionTitheTotal = incomeTransactions
      .filter((t) => {
        const resolved = resolveCategory(t.category);
        if (!MISSION_TITHE_CATEGORIES.has(resolved)) return false;
        const fund = fundMap.get(t.fundId);
        return fund?.type === "Unrestricted";
      })
      .reduce((sum, t) => sum + t.amount, 0);
```

- [ ] **Step 4: Rewrite Tithes breakdown to include anonymous**

Replace lines 530-537 (tithes breakdown):

```typescript
    // Tithes breakdown (individual donors + anonymous aggregate)
    const titheTransactions = incomeTransactions.filter(
      (t) => resolveCategory(t.category) === "Tithes & First Fruits"
    );

    const namedTithes = titheTransactions
      .filter((t) => t.donorName)
      .map((t) => ({
        donorName: t.donorName!,
        amount: t.amount,
        isGiftAidEligible: t.isGiftAidEligible || false,
      }));

    const anonymousTitheTotal = titheTransactions
      .filter((t) => !t.donorName)
      .reduce((sum, t) => sum + t.amount, 0);

    const tithes = [
      ...namedTithes,
      ...(anonymousTitheTotal > 0
        ? [{ donorName: "Anonymous", amount: anonymousTitheTotal, isGiftAidEligible: false }]
        : []),
    ];
```

- [ ] **Step 5: Update weeklyCashSummary tithe filter**

Replace lines 136-143 in `weeklyCashSummary`:

```typescript
// Before:
    const tithes = incomeTransactions
      .filter((t) => isTitheCategory(t.category) && t.donorName)
      .map((t) => ({
        donorName: t.donorName,
        amount: t.amount,
        isGiftAidEligible: t.isGiftAidEligible,
      }));

// After:
    const titheTransactions = incomeTransactions.filter(
      (t) => resolveCategory(t.category) === "Tithes & First Fruits"
    );
    const namedTithes = titheTransactions
      .filter((t) => t.donorName)
      .map((t) => ({
        donorName: t.donorName,
        amount: t.amount,
        isGiftAidEligible: t.isGiftAidEligible,
      }));
    const anonymousTitheTotal = titheTransactions
      .filter((t) => !t.donorName)
      .reduce((sum, t) => sum + t.amount, 0);
    const tithes = [
      ...namedTithes,
      ...(anonymousTitheTotal > 0
        ? [{ donorName: "Anonymous", amount: anonymousTitheTotal, isGiftAidEligible: false }]
        : []),
    ];
```

- [ ] **Step 6: Remove the old helper functions**

Verify that `isDonationCategory` and `isTitheCategory` (the deleted functions from step 1) are no longer referenced anywhere in the file. The `getWeekEndingDate` and `getSundaysInMonth` helpers remain unchanged.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add convex/queries/reports.ts
git commit -m "fix: rewrite report grouping - use DB mainCategory with alias fallback, scope Mission Tithe to General Fund"
```

---

### Task 5: Add Data Migration Mutation

**Files:**
- Modify: `convex/mutations/categories.ts` (add `migrateTransactionCategories` mutation)

- [ ] **Step 1: Add the migration mutation**

Add at the end of `convex/mutations/categories.ts`, after the `migrateToMainCategories` mutation:

```typescript
// One-time migration: rename orphaned transaction categories to canonical RCI names
// and ensure all RCI categories exist with correct mainCategory mappings.
// Idempotent — safe to run multiple times.
export const migrateTransactionCategories = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin"]);

    const ALIASES: Record<string, string> = {
      "Tithe": "Tithes & First Fruits",
      "Tithes": "Tithes & First Fruits",
      "First Fruit": "Tithes & First Fruits",
      "Offering": "Offerings",
      "Books": "Merchandise",
      "Other": "Uncategorised",
    };

    const summary = {
      transactionsRenamed: 0,
      categoriesRenamed: 0,
      categoriesCreated: [] as string[],
      details: {} as Record<string, { from: string; count: number }>,
    };

    // Step 1: Rename category records that use old names
    for (const [oldName, newName] of Object.entries(ALIASES)) {
      const oldCategory = await ctx.db
        .query("categories")
        .withIndex("by_organization_name", (q) =>
          q.eq("organizationId", user.organizationId).eq("name", oldName)
        )
        .first();

      if (oldCategory) {
        // Check if canonical name already exists
        const existingCanonical = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", user.organizationId).eq("name", newName)
          )
          .first();

        if (existingCanonical) {
          // Canonical exists — just delete the old one (transactions will be updated below)
          await ctx.db.delete(oldCategory._id);
        } else {
          // Rename the old category to the canonical name
          await ctx.db.patch(oldCategory._id, { name: newName });
        }
        summary.categoriesRenamed++;
      }
    }

    // Step 2: Update all transactions with old category names
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    for (const t of transactions) {
      const canonical = ALIASES[t.category];
      if (canonical) {
        await ctx.db.patch(t._id, { category: canonical });
        summary.transactionsRenamed++;
        if (!summary.details[t.category]) {
          summary.details[t.category] = { from: t.category, count: 0 };
        }
        summary.details[t.category].count++;
      }
    }

    // Step 3: Ensure "Donation" category exists under "Donations" main category
    const donationCategory = await ctx.db
      .query("categories")
      .withIndex("by_organization_name", (q) =>
        q.eq("organizationId", user.organizationId).eq("name", "Donation")
      )
      .first();

    if (!donationCategory) {
      await ctx.db.insert("categories", {
        organizationId: user.organizationId,
        name: "Donation",
        mainCategory: "Donations",
        transactionType: "Income",
        displayOrder: 3,
        createdAt: Date.now(),
      });
      summary.categoriesCreated.push("Donation");
    } else if (donationCategory.mainCategory !== "Donations") {
      await ctx.db.patch(donationCategory._id, {
        mainCategory: "Donations",
        transactionType: "Income",
      });
    }

    // Step 4: Re-run seedRCICategories logic to ensure all canonical categories exist
    // (import is not needed — we inline the essential parts)
    const RCI_INCOME: Record<string, string[]> = {
      "Donations": ["Tithes & First Fruits", "Offerings", "Thanksgiving"],
      "Building Fund": [],
      "Charitable Activities": ["Charity Fund", "Gender Ministries"],
      "Other Income": ["Merchandise", "Uncategorised"],
    };

    const RCI_EXPENDITURE: Record<string, string[]> = {
      "Major Programs": ["MP Honorarium", "MP Accommodation", "MP Refreshments"],
      "Ministry Costs": ["Church Provisions", "Travel & Transport"],
      "Staff & Volunteer Costs": ["Gross Salary", "Allowances"],
      "Premises Costs": ["Rent", "Utilities"],
      "Mission Costs": ["Missions-Tithe", "Mission Support"],
      "Admin & Governance": ["Bank Charges", "IT Costs", "Love Gifts"],
    };

    let displayOrder = 0;
    for (const [mainCat, subcats] of Object.entries(RCI_INCOME)) {
      const names = subcats.length === 0 ? [mainCat] : subcats;
      for (const name of names) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", user.organizationId).eq("name", name)
          )
          .first();

        if (!existing) {
          await ctx.db.insert("categories", {
            organizationId: user.organizationId,
            name,
            mainCategory: mainCat,
            transactionType: "Income",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          summary.categoriesCreated.push(name);
        } else {
          await ctx.db.patch(existing._id, {
            mainCategory: mainCat,
            transactionType: "Income",
            displayOrder: displayOrder++,
          });
        }
      }
    }

    for (const [mainCat, subcats] of Object.entries(RCI_EXPENDITURE)) {
      const names = subcats.length === 0 ? [mainCat] : subcats;
      for (const name of names) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_organization_name", (q) =>
            q.eq("organizationId", user.organizationId).eq("name", name)
          )
          .first();

        if (!existing) {
          await ctx.db.insert("categories", {
            organizationId: user.organizationId,
            name,
            mainCategory: mainCat,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
            createdAt: Date.now(),
          });
          summary.categoriesCreated.push(name);
        } else {
          await ctx.db.patch(existing._id, {
            mainCategory: mainCat,
            transactionType: "Expenditure",
            displayOrder: displayOrder++,
          });
        }
      }
    }

    return summary;
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/mutations/categories.ts
git commit -m "feat: add migrateTransactionCategories mutation for one-time data cleanup"
```

---

### Task 6: Update Mission Tithe Labels in Exports

**Files:**
- Modify: `services/pdfGenerator.ts:678` (section title)
- Modify: `services/pdfGenerator.ts:698` (tithe to pay label)
- Modify: `services/excelGenerator.ts:102` (sheet header)
- Modify: `services/excelGenerator.ts:111` (tithe to pay label)
- Modify: `components/Reports.tsx:451` (section title)
- Modify: `components/Reports.tsx:485` (tithe to pay label)

- [ ] **Step 1: Update PDF generator labels**

In `services/pdfGenerator.ts`:

Line 678:
```html
<!-- Before: -->
<div class="section-title">Mission Tithe</div>

<!-- After: -->
<div class="section-title">Mission Tithe (10% of General Fund Donations)</div>
```

Line 698:
```html
<!-- Before: -->
<td><strong>Mission Tithe to Pay (10%)</strong></td>

<!-- After: -->
<td><strong>Mission Tithe to Pay</strong></td>
```

- [ ] **Step 2: Update Excel generator labels**

In `services/excelGenerator.ts`:

Line 102:
```typescript
// Before:
    ['Mission Tithe'],

// After:
    ['Mission Tithe (10% of General Fund Donations)'],
```

Line 111:
```typescript
// Before:
    missionTitheData.push(['Mission Tithe to Pay (10%)', reportData.missionTithe.titheToPay]);

// After:
    missionTitheData.push(['Mission Tithe to Pay', reportData.missionTithe.titheToPay]);
```

- [ ] **Step 3: Update Reports component labels**

In `components/Reports.tsx`:

Line 451:
```tsx
// Before:
              <h3 className="font-bold text-ink">Mission Tithe</h3>

// After:
              <h3 className="font-bold text-ink">Mission Tithe (10% of General Fund Donations)</h3>
```

Line 485:
```tsx
// Before:
                    <td className="px-4 py-3 text-sm text-amber">Mission Tithe to Pay (10%)</td>

// After:
                    <td className="px-4 py-3 text-sm text-amber">Mission Tithe to Pay</td>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add services/pdfGenerator.ts services/excelGenerator.ts components/Reports.tsx
git commit -m "fix: update Mission Tithe labels to clarify General Fund scope"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors across entire project

- [ ] **Step 2: Start dev servers and manually verify**

Run `npm run dev` and `npx convex dev` simultaneously. In the browser:

1. Open Reports → Monthly tab → verify Offerings now appears under "Donations" (not "Other")
2. Verify Mission Tithe section title shows "(10% of General Fund Donations)"
3. Open Record Cash → verify dropdown shows "Tithes & First Fruits", "Donation", "Offerings", "Thanksgiving"
4. Open Record Cash → Category Totals tab → verify dropdown shows "Offerings", "Thanksgiving", "Merchandise", "Uncategorised"
5. Run the migration from Convex dashboard: call `mutations.categories.migrateTransactionCategories`
6. Re-check monthly report — all categories should now group correctly

- [ ] **Step 3: Export verification**

1. Export monthly report as PDF → verify correct grouping and Mission Tithe label
2. Export monthly report as Excel → verify correct grouping and Mission Tithe label

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: final adjustments from manual verification"
```
