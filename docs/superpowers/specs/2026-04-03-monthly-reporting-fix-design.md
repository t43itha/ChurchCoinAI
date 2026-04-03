# Monthly Reporting: Category & Calculation Fix

## Problem

Transaction categories from different entry points (Cash Takings, manual entry, AI categorisation) use inconsistent names that don't match the RCI category hierarchy. This causes:

1. **Incorrect report grouping** — Transactions fall into "Other Income" instead of their correct RCI main category (e.g., "Offerings" appears under "Other" instead of "Donations")
2. **Mission Tithe miscalculation** — Hardcoded `isDonationCategory()` string matching misses variant names and includes donations to non-general funds
3. **Cash Takings category drift** — Contribution types ("Tithe", "First Fruit", "Offering") don't match RCI subcategory names ("Tithes & First Fruits", "Offerings")
4. **Orphaned categories** — "Books", "Other", "Donation" have no `mainCategory` mapping in the DB

## Design

### 1. RCI Category Constants Update

**File:** `constants/rciCategories.ts`

Update canonical subcategory name:
```
"Donations": ["Tithes & First Fruits", "Offerings", "Thanksgiving"]
```

Add a category alias map for migration and fallback normalisation:
```typescript
export const CATEGORY_ALIASES: Record<string, string> = {
  "Tithe": "Tithes & First Fruits",
  "Tithes": "Tithes & First Fruits",
  "First Fruit": "Tithes & First Fruits",
  "Offering": "Offerings",
  "Books": "Merchandise",
  "Other": "Uncategorised",
};
```

"Donation" is not aliased — it stays as "Donation" and is handled by fund-based grouping at report time.

### 2. Cash Takings Standardisation

**File:** `components/CashTakingsEntry.tsx`

Named contribution types change from:
- `'Tithe' | 'Pledge' | 'First Fruit' | 'Thanksgiving' | 'Offering'`

To:
- `'Tithes & First Fruits' | 'Donation' | 'Offerings' | 'Thanksgiving'`

Key changes:
- "Tithe" and "First Fruit" merge into "Tithes & First Fruits"
- "Pledge" becomes "Donation" — fund selection and pledge linking still available
- "Offering" becomes "Offerings"

Category totals dropdown replaces hardcoded options with a filtered subset of RCI income categories from the DB. The subset excludes "Tithes & First Fruits" (entered via named contributions). Available options: "Offerings", "Thanksgiving", "Merchandise", "Uncategorised", and any other RCI income subcategories.

**File:** `convex/mutations/cashCollections.ts`

Update accepted contribution type values to match the new names. The mutation already saves `contribution.type` as the transaction category — no structural change needed.

### 3. Report Grouping Logic

**File:** `convex/queries/reports.ts`

**Remove** `isDonationCategory()` and `isTitheCategory()` helper functions.

**New income grouping logic:**
1. Look up `transaction.category` in DB category records → use its `mainCategory`
2. If not found, check `CATEGORY_ALIASES` → resolve to canonical name → look up again
3. Special case for `"Donation"`: look up the transaction's `fundId` → get the fund → if the fund name matches an RCI main category (e.g., "Building Fund"), use that as the main category. If the fund is Unrestricted (General Fund), group under "Donations". Final fallback: "Donations"
4. Final fallback: `"Other Income"`

**Mission Tithe calculation (tightened scope):**
```
Mission Tithe = sum of transactions where:
  - category IN ("Offerings", "Tithes & First Fruits", "Thanksgiving")
  - AND fund.type === "Unrestricted"
```

The query loads funds to check their type. This replaces the hardcoded `isDonationCategory()` check.

**Tithe breakdown:**
- Filter: `category === "Tithes & First Fruits"` (exact match, no more `isTitheCategory()`)
- Remove the `&& t.donorName` filter — include anonymous tithes
- Named donors shown individually
- Anonymous tithes aggregated into a single "Anonymous" row at the bottom

### 4. Data Migration

**File:** `convex/mutations/categories.ts`

New mutation `migrateTransactionCategories` (Admin-only, idempotent):

1. Rename existing category records using the alias map (e.g., "Offering" → "Offerings", "Books" → "Merchandise")
2. Update all transactions referencing old names to canonical names
3. Ensure all RCI canonical categories exist with correct `mainCategory` mappings
4. Add "Donation" as a subcategory under "Donations" main category
5. Return summary of changes made

Triggered manually by Admin from settings.

### 5. PDF & Excel Export

**Files:** `services/pdfGenerator.ts`, `services/excelGenerator.ts`

No structural changes — exports consume `monthlyReportData` which will now return correctly grouped data.

Only update: Mission Tithe section label changes to "Mission Tithe (10% of General Fund Donations)" to clarify scope.

## Files to Modify

| File | Change |
|------|--------|
| `constants/rciCategories.ts` | Fix "Offering" → "Offerings", add alias map |
| `components/CashTakingsEntry.tsx` | New contribution types, DB-driven category dropdown |
| `convex/mutations/cashCollections.ts` | Accept new contribution type values |
| `convex/queries/reports.ts` | New grouping logic, fund-scoped Mission Tithe, anonymous tithes |
| `convex/mutations/categories.ts` | Add migration mutation |
| `services/pdfGenerator.ts` | Update Mission Tithe label |
| `services/excelGenerator.ts` | Update Mission Tithe label |

## Out of Scope

- Schema changes (no `categoryId` foreign key)
- Annual report changes (will benefit from same fixes but no additional work)
- AI categorisation prompt updates (separate concern)
