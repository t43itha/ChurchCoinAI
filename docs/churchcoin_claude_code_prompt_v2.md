# ChurchCoin Finance Module - Claude Code Prompt

## Project Context

Building a church finance and fund management feature for **churchcoin.co.uk** - a platform for small/medium UK churches (Pentecostal & Baptist focus initially).

### Tech Stack
- **Frontend:** React + Next.js (migrating to Vite in v2)
- **Database:** Convex
- **Auth:** Clerk
- **Target:** UK churches with Charity Commission & HMRC Gift Aid compliance

### Reference Implementation
I have a working Python-based workflow for RCI Missions that handles:
- CSV transaction import with auto-categorization
- Monthly/annual accounts generation
- Excel dashboards with KPIs
- PDF reports for leadership

Generalize this into a multi-tenant SaaS feature within the Convex/Next.js stack.

---

## Convex Schema Design

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Churches (tenants) - linked to Clerk organizations
  churches: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    charityNumber: v.optional(v.string()),
    giftAidRegistered: v.boolean(),
    financialYearStart: v.number(), // 1-12 (month)
    currency: v.string(), // "GBP"
    denomination: v.union(v.literal("pentecostal"), v.literal("baptist"), v.literal("other")),
    settings: v.object({
      autoCategorizationEnabled: v.boolean(),
      requireDocumentAttachment: v.boolean(),
      defaultFundId: v.optional(v.id("funds")),
    }),
  })
    .index("by_clerk_org", ["clerkOrgId"]),

  // Chart of Accounts / Categories
  categories: defineTable({
    churchId: v.id("churches"),
    name: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    sofaClassification: v.string(), // Charity Commission SOFA mapping
    keywords: v.array(v.string()), // For auto-categorization
    isDefault: v.boolean(), // System-provided vs custom
    isActive: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_type", ["churchId", "type"]),

  // Funds (General, Restricted, Designated)
  funds: defineTable({
    churchId: v.id("churches"),
    name: v.string(),
    type: v.union(v.literal("general"), v.literal("restricted"), v.literal("designated")),
    purpose: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_church", ["churchId"]),

  // Transactions
  transactions: defineTable({
    churchId: v.id("churches"),
    date: v.number(), // Unix timestamp
    description: v.string(),
    amount: v.number(), // Positive = income, stored as pence/cents
    type: v.union(v.literal("income"), v.literal("expense")),
    categoryId: v.optional(v.id("categories")),
    fundId: v.id("funds"),
    payee: v.optional(v.string()),
    reference: v.optional(v.string()),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("card"),
      v.literal("bank_transfer"),
      v.literal("direct_debit"),
      v.literal("standing_order"),
      v.literal("cheque")
    ),
    // Gift Aid tracking
    giftAidEligible: v.boolean(),
    donorId: v.optional(v.id("donors")),
    // Metadata
    documentUrls: v.array(v.string()),
    notes: v.optional(v.string()),
    importBatchId: v.optional(v.string()),
    // Auto-categorization
    categorizationConfidence: v.optional(v.number()), // 0-1
    manuallyReviewed: v.boolean(),
    // Audit
    createdBy: v.string(), // Clerk user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_church", ["churchId"])
    .index("by_church_date", ["churchId", "date"])
    .index("by_church_category", ["churchId", "categoryId"])
    .index("by_church_fund", ["churchId", "fundId"])
    .index("by_donor", ["donorId"]),

  // Donors (for Gift Aid)
  donors: defineTable({
    churchId: v.id("churches"),
    // Personal info (encrypted/hashed in production)
    firstName: v.string(),
    lastName: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    city: v.string(),
    postcode: v.string(),
    // Gift Aid
    isUkTaxpayer: v.boolean(),
    giftAidDeclarationDate: v.optional(v.number()),
    giftAidDeclarationMethod: v.optional(v.string()), // "written", "verbal", "online"
    // GDPR
    consentGiven: v.boolean(),
    consentDate: v.number(),
    // Anonymous giving option
    anonymousId: v.optional(v.string()), // For tracking without PII
  })
    .index("by_church", ["churchId"]),

  // Budget (optional)
  budgets: defineTable({
    churchId: v.id("churches"),
    categoryId: v.id("categories"),
    financialYear: v.number(), // e.g., 2025
    monthlyAmount: v.number(), // Budgeted amount per month
    notes: v.optional(v.string()),
  })
    .index("by_church_year", ["churchId", "financialYear"]),

  // Import batches for tracking CSV imports
  importBatches: defineTable({
    churchId: v.id("churches"),
    fileName: v.string(),
    importedAt: v.number(),
    importedBy: v.string(),
    transactionCount: v.number(),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    errors: v.array(v.string()),
  })
    .index("by_church", ["churchId"]),
});
```

---

## Default Categories (Pentecostal/Baptist UK)

```typescript
// convex/seed/defaultCategories.ts

export const DEFAULT_INCOME_CATEGORIES = [
  // Donations and legacies
  { name: "Tithes", sofaClassification: "donations_legacies", keywords: ["tithe", "tenth"] },
  { name: "General Offerings", sofaClassification: "donations_legacies", keywords: ["offering", "collection", "sunday", "service"] },
  { name: "First Fruits", sofaClassification: "donations_legacies", keywords: ["first fruit", "firstfruit", "harvest"] },
  { name: "Seed Faith / Sacrificial", sofaClassification: "donations_legacies", keywords: ["seed", "sacrifice", "faith", "sow"] },
  { name: "Thanksgiving", sofaClassification: "donations_legacies", keywords: ["thanksgiving", "gratitude"] },
  { name: "Missions Offering", sofaClassification: "donations_legacies", keywords: ["mission", "missionary"] },
  { name: "Building Fund", sofaClassification: "donations_legacies", keywords: ["building", "construction", "renovation"] },
  { name: "Benevolence Donations", sofaClassification: "donations_legacies", keywords: ["benevolence", "welfare", "hardship"] },
  { name: "Legacy/Bequest", sofaClassification: "donations_legacies", keywords: ["legacy", "bequest", "estate", "will"] },
  { name: "Grants Received", sofaClassification: "donations_legacies", keywords: ["grant"] },
  
  // Charitable activities
  { name: "Program/Event Income", sofaClassification: "charitable_activities", keywords: ["program", "conference", "convention", "event", "registration"] },
  { name: "Ministry Income", sofaClassification: "charitable_activities", keywords: ["ministry", "course", "class", "seminar"] },
  { name: "Youth Ministry", sofaClassification: "charitable_activities", keywords: ["youth", "teen", "young people"] },
  { name: "Women's Ministry", sofaClassification: "charitable_activities", keywords: ["women", "ladies", "rlm"] },
  { name: "Men's Ministry", sofaClassification: "charitable_activities", keywords: ["men", "brothers"] },
  
  // Other trading
  { name: "Facility Rental", sofaClassification: "other_trading", keywords: ["rental", "hire", "hall", "room"] },
  { name: "Bookshop/Resources", sofaClassification: "other_trading", keywords: ["book", "resource", "shop", "sale"] },
  
  // Investments
  { name: "Bank Interest", sofaClassification: "investments", keywords: ["interest", "dividend"] },
  
  // Other
  { name: "Gift Aid Recovered", sofaClassification: "other", keywords: ["gift aid", "hmrc", "tax recovered"] },
  { name: "Other Income", sofaClassification: "other", keywords: [] },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  // Staff costs
  { name: "Pastor/Staff Salaries", sofaClassification: "staff_costs", keywords: ["salary", "wages", "payroll", "pastor"] },
  { name: "Pension Contributions", sofaClassification: "staff_costs", keywords: ["pension"] },
  { name: "PAYE/National Insurance", sofaClassification: "staff_costs", keywords: ["paye", "ni", "national insurance", "hmrc", "tax"] },
  
  // Premises
  { name: "Rent/Lease", sofaClassification: "premises", keywords: ["rent", "lease"] },
  { name: "Utilities", sofaClassification: "premises", keywords: ["electric", "gas", "water", "utility", "energy"] },
  { name: "Insurance", sofaClassification: "premises", keywords: ["insurance"] },
  { name: "Repairs & Maintenance", sofaClassification: "premises", keywords: ["repair", "maintenance", "fix", "plumber", "electrician"] },
  { name: "Cleaning", sofaClassification: "premises", keywords: ["cleaning", "cleaner", "janitorial"] },
  
  // Ministry costs
  { name: "Guest Speaker/Honorarium", sofaClassification: "ministry", keywords: ["honorarium", "speaker", "guest", "minister"] },
  { name: "Travel & Transport", sofaClassification: "ministry", keywords: ["travel", "transport", "fuel", "mileage", "uber", "taxi"] },
  { name: "Hospitality & Catering", sofaClassification: "ministry", keywords: ["food", "catering", "refreshment", "hospitality", "love feast"] },
  { name: "Outreach & Evangelism", sofaClassification: "ministry", keywords: ["outreach", "evangelism", "tract", "flyer"] },
  { name: "Children's Ministry", sofaClassification: "ministry", keywords: ["children", "kids", "sunday school"] },
  { name: "Youth Ministry Expenses", sofaClassification: "ministry", keywords: ["youth", "teen"] },
  
  // Program costs
  { name: "Conference/Event Costs", sofaClassification: "programs", keywords: ["conference", "convention", "event", "program"] },
  { name: "Retreat Costs", sofaClassification: "programs", keywords: ["retreat", "camp"] },
  
  // Charitable giving
  { name: "Missions Support", sofaClassification: "charitable", keywords: ["mission", "missionary", "overseas"] },
  { name: "Benevolence/Welfare", sofaClassification: "charitable", keywords: ["benevolence", "welfare", "hardship", "love gift", "bereavement"] },
  { name: "Denominational Dues", sofaClassification: "charitable", keywords: ["tithe remittance", "hq", "denomination", "head office"] },
  { name: "Charity Donations", sofaClassification: "charitable", keywords: ["donation", "charity", "foodbank"] },
  
  // Resources
  { name: "Equipment & Furniture", sofaClassification: "resources", keywords: ["equipment", "furniture", "chair", "table"] },
  { name: "Sound/AV Equipment", sofaClassification: "resources", keywords: ["sound", "audio", "video", "projector", "microphone", "speaker"] },
  { name: "IT & Software", sofaClassification: "resources", keywords: ["software", "subscription", "zoom", "computer", "it"] },
  { name: "Printing & Stationery", sofaClassification: "resources", keywords: ["print", "stationery", "office", "paper"] },
  { name: "Media & Publicity", sofaClassification: "resources", keywords: ["media", "publicity", "advertising", "banner", "social"] },
  
  // Governance
  { name: "Professional Fees", sofaClassification: "governance", keywords: ["accountant", "legal", "audit", "solicitor"] },
  { name: "Bank Charges", sofaClassification: "governance", keywords: ["bank charge", "fee", "pdq", "stripe", "paypal"] },
  { name: "Licenses & Subscriptions", sofaClassification: "governance", keywords: ["license", "ccli", "prs"] },
  
  { name: "Other Expenses", sofaClassification: "other", keywords: [] },
];
```

---

## Convex Functions

### Transaction Import & Auto-Categorization

```typescript
// convex/transactions.ts
import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES } from "./seed/defaultCategories";

// Auto-categorize based on description
export const categorizeTransaction = (
  description: string,
  amount: number,
  categories: Array<{ _id: string; name: string; keywords: string[]; type: string }>
): { categoryId: string | null; confidence: number } => {
  const descLower = description.toLowerCase();
  const type = amount >= 0 ? "income" : "expense";
  
  const relevantCategories = categories.filter(c => c.type === type);
  
  let bestMatch: { categoryId: string; confidence: number } | null = null;
  
  for (const category of relevantCategories) {
    for (const keyword of category.keywords) {
      if (descLower.includes(keyword.toLowerCase())) {
        const confidence = keyword.length / descLower.length; // Simple heuristic
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { categoryId: category._id, confidence: Math.min(confidence * 2, 0.95) };
        }
      }
    }
  }
  
  return bestMatch || { categoryId: null, confidence: 0 };
};

// Import transactions from CSV data
export const importTransactions = mutation({
  args: {
    churchId: v.id("churches"),
    transactions: v.array(v.object({
      date: v.string(), // ISO date string
      description: v.string(),
      amount: v.number(),
      payee: v.optional(v.string()),
      reference: v.optional(v.string()),
      paymentMethod: v.optional(v.string()),
      category: v.optional(v.string()), // Pre-assigned category name
    })),
    importBatchId: v.string(),
  },
  handler: async (ctx, args) => {
    const { churchId, transactions, importBatchId } = args;
    
    // Get church's categories
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .collect();
    
    // Get default fund
    const church = await ctx.db.get(churchId);
    const funds = await ctx.db
      .query("funds")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .collect();
    const defaultFund = funds.find(f => f.type === "general") || funds[0];
    
    const results = [];
    
    for (const tx of transactions) {
      const amount = Math.round(tx.amount * 100); // Convert to pence
      const type = amount >= 0 ? "income" : "expense";
      
      // Try to match pre-assigned category
      let categoryId = null;
      let confidence = 0;
      
      if (tx.category) {
        const matchedCat = categories.find(
          c => c.name.toLowerCase() === tx.category!.toLowerCase()
        );
        if (matchedCat) {
          categoryId = matchedCat._id;
          confidence = 1;
        }
      }
      
      // Auto-categorize if no match
      if (!categoryId) {
        const result = categorizeTransaction(tx.description, amount, categories);
        categoryId = result.categoryId;
        confidence = result.confidence;
      }
      
      const txId = await ctx.db.insert("transactions", {
        churchId,
        date: new Date(tx.date).getTime(),
        description: tx.description,
        amount: Math.abs(amount),
        type,
        categoryId,
        fundId: defaultFund._id,
        payee: tx.payee,
        reference: tx.reference,
        paymentMethod: (tx.paymentMethod as any) || "bank_transfer",
        giftAidEligible: false,
        donorId: undefined,
        documentUrls: [],
        notes: undefined,
        importBatchId,
        categorizationConfidence: confidence,
        manuallyReviewed: false,
        createdBy: "system", // Replace with Clerk user ID
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      results.push({ txId, confidence, needsReview: confidence < 0.7 });
    }
    
    return results;
  },
});

// Get transactions with filters
export const getTransactions = query({
  args: {
    churchId: v.id("churches"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    categoryId: v.optional(v.id("categories")),
    fundId: v.optional(v.id("funds")),
    needsReview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("transactions")
      .withIndex("by_church_date", (q) => q.eq("churchId", args.churchId));
    
    const transactions = await query.collect();
    
    // Filter in memory (Convex doesn't support complex filters)
    return transactions.filter(tx => {
      if (args.startDate && tx.date < args.startDate) return false;
      if (args.endDate && tx.date > args.endDate) return false;
      if (args.type && tx.type !== args.type) return false;
      if (args.categoryId && tx.categoryId !== args.categoryId) return false;
      if (args.fundId && tx.fundId !== args.fundId) return false;
      if (args.needsReview !== undefined) {
        const needsReview = !tx.manuallyReviewed && (tx.categorizationConfidence || 0) < 0.7;
        if (args.needsReview !== needsReview) return false;
      }
      return true;
    });
  },
});
```

### Dashboard & Reporting

```typescript
// convex/reports.ts
import { v } from "convex/values";
import { query } from "./_generated/server";

export const getDashboardData = query({
  args: {
    churchId: v.id("churches"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const { churchId, startDate, endDate } = args;
    
    // Get all transactions in period
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_church_date", (q) => q.eq("churchId", churchId))
      .collect();
    
    const periodTransactions = transactions.filter(
      tx => tx.date >= startDate && tx.date <= endDate
    );
    
    // Get categories
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_church", (q) => q.eq("churchId", churchId))
      .collect();
    
    const categoryMap = new Map(categories.map(c => [c._id, c]));
    
    // Calculate KPIs
    const income = periodTransactions
      .filter(tx => tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const expenses = periodTransactions
      .filter(tx => tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const surplus = income - expenses;
    const margin = income > 0 ? (surplus / income) * 100 : 0;
    
    // Income by category
    const incomeByCategory: Record<string, number> = {};
    periodTransactions
      .filter(tx => tx.type === "income" && tx.categoryId)
      .forEach(tx => {
        const cat = categoryMap.get(tx.categoryId!);
        const name = cat?.name || "Uncategorized";
        incomeByCategory[name] = (incomeByCategory[name] || 0) + tx.amount;
      });
    
    // Expenses by category
    const expensesByCategory: Record<string, number> = {};
    periodTransactions
      .filter(tx => tx.type === "expense" && tx.categoryId)
      .forEach(tx => {
        const cat = categoryMap.get(tx.categoryId!);
        const name = cat?.name || "Uncategorized";
        expensesByCategory[name] = (expensesByCategory[name] || 0) + tx.amount;
      });
    
    // Transactions needing review
    const needsReview = periodTransactions.filter(
      tx => !tx.manuallyReviewed && (tx.categorizationConfidence || 0) < 0.7
    ).length;
    
    // Unique tithe donors (anonymized count)
    const titheDonors = new Set(
      periodTransactions
        .filter(tx => {
          const cat = categoryMap.get(tx.categoryId!);
          return cat?.name.toLowerCase().includes("tithe");
        })
        .map(tx => tx.payee)
        .filter(Boolean)
    ).size;
    
    return {
      kpis: {
        totalIncome: income / 100, // Convert back to pounds
        totalExpenses: expenses / 100,
        surplus: surplus / 100,
        marginPercent: margin,
        transactionCount: periodTransactions.length,
        needsReviewCount: needsReview,
        titheDonorCount: titheDonors,
      },
      incomeByCategory: Object.entries(incomeByCategory).map(([name, amount]) => ({
        name,
        amount: amount / 100,
        percentage: income > 0 ? (amount / income) * 100 : 0,
      })).sort((a, b) => b.amount - a.amount),
      expensesByCategory: Object.entries(expensesByCategory).map(([name, amount]) => ({
        name,
        amount: amount / 100,
        percentage: expenses > 0 ? (amount / expenses) * 100 : 0,
      })).sort((a, b) => b.amount - a.amount),
    };
  },
});

// Monthly summary for SOFA report
export const getMonthlySummary = query({
  args: {
    churchId: v.id("churches"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const { churchId, year } = args;
    
    const startOfYear = new Date(year, 0, 1).getTime();
    const endOfYear = new Date(year, 11, 31, 23, 59, 59).getTime();
    
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_church_date", (q) => q.eq("churchId", churchId))
      .collect();
    
    const yearTransactions = transactions.filter(
      tx => tx.date >= startOfYear && tx.date <= endOfYear
    );
    
    // Group by month
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      income: 0,
      expenses: 0,
    }));
    
    yearTransactions.forEach(tx => {
      const month = new Date(tx.date).getMonth();
      if (tx.type === "income") {
        months[month].income += tx.amount;
      } else {
        months[month].expenses += tx.amount;
      }
    });
    
    return months.map(m => ({
      ...m,
      income: m.income / 100,
      expenses: m.expenses / 100,
      surplus: (m.income - m.expenses) / 100,
    }));
  },
});
```

---

## React Components

### CSV Import Component

```tsx
// components/finance/TransactionImport.tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Papa from "papaparse";

interface TransactionRow {
  date: string;
  description: string;
  amount: number;
  payee?: string;
  reference?: string;
  paymentMethod?: string;
  category?: string;
}

export function TransactionImport({ churchId }: { churchId: string }) {
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<TransactionRow[]>([]);
  const importTransactions = useMutation(api.transactions.importTransactions);
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions = results.data.map((row: any) => ({
          date: row.date,
          description: row.description,
          amount: parseFloat(row.amount),
          payee: row.payee,
          reference: row.reference,
          paymentMethod: row.payment_method || row.paymentMethod,
          category: row.category,
        }));
        setPreview(transactions);
      },
      error: (error) => {
        toast({ title: "Error parsing CSV", description: error.message, variant: "destructive" });
      },
    });
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    
    setIsImporting(true);
    try {
      const batchId = `import-${Date.now()}`;
      const results = await importTransactions({
        churchId: churchId as any,
        transactions: preview,
        importBatchId: batchId,
      });
      
      const needsReview = results.filter(r => r.needsReview).length;
      toast({
        title: "Import successful",
        description: `${results.length} transactions imported. ${needsReview} need review.`,
      });
      setPreview([]);
    } catch (error) {
      toast({ title: "Import failed", description: String(error), variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
          id="csv-upload"
        />
        <label htmlFor="csv-upload" className="cursor-pointer">
          <p className="text-lg font-medium">Drop CSV file or click to upload</p>
          <p className="text-sm text-muted-foreground mt-1">
            Expected columns: date, description, amount, payee, reference, category
          </p>
        </label>
      </div>

      {preview.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-medium">Preview ({preview.length} transactions)</h3>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-left">Category</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((tx, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{tx.date}</td>
                    <td className="p-2">{tx.description}</td>
                    <td className={`p-2 text-right ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      £{Math.abs(tx.amount).toFixed(2)}
                    </td>
                    <td className="p-2 text-muted-foreground">{tx.category || "Auto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 10 && (
              <p className="p-2 text-center text-muted-foreground">
                +{preview.length - 10} more transactions
              </p>
            )}
          </div>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? "Importing..." : `Import ${preview.length} Transactions`}
          </Button>
        </div>
      )}
    </div>
  );
}
```

### Dashboard Component

```tsx
// components/finance/Dashboard.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, TrendingUp, Users, AlertCircle } from "lucide-react";

export function FinanceDashboard({ churchId }: { churchId: string }) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

  const data = useQuery(api.reports.getDashboardData, {
    churchId: churchId as any,
    startDate: startOfMonth,
    endDate: endOfMonth,
  });

  if (!data) return <div>Loading...</div>;

  const { kpis, incomeByCategory, expensesByCategory } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total Income"
          value={`£${kpis.totalIncome.toLocaleString()}`}
          icon={<ArrowUp className="text-green-500" />}
        />
        <KPICard
          title="Total Expenses"
          value={`£${kpis.totalExpenses.toLocaleString()}`}
          icon={<ArrowDown className="text-red-500" />}
        />
        <KPICard
          title="Net Position"
          value={`£${kpis.surplus.toLocaleString()}`}
          icon={<TrendingUp className={kpis.surplus >= 0 ? "text-green-500" : "text-red-500"} />}
          variant={kpis.surplus >= 0 ? "success" : "danger"}
        />
        <KPICard
          title="Needs Review"
          value={kpis.needsReviewCount.toString()}
          icon={<AlertCircle className="text-yellow-500" />}
          variant={kpis.needsReviewCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Category Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Income by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {incomeByCategory.slice(0, 5).map((cat) => (
                <div key={cat.name} className="flex justify-between items-center">
                  <span className="text-sm">{cat.name}</span>
                  <div className="text-right">
                    <span className="font-medium">£{cat.amount.toLocaleString()}</span>
                    <span className="text-muted-foreground text-xs ml-2">
                      ({cat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expensesByCategory.slice(0, 5).map((cat) => (
                <div key={cat.name} className="flex justify-between items-center">
                  <span className="text-sm">{cat.name}</span>
                  <div className="text-right">
                    <span className="font-medium">£{cat.amount.toLocaleString()}</span>
                    <span className="text-muted-foreground text-xs ml-2">
                      ({cat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ 
  title, 
  value, 
  icon, 
  variant = "default" 
}: { 
  title: string; 
  value: string; 
  icon: React.ReactNode;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const bgClass = {
    default: "bg-muted/50",
    success: "bg-green-50 dark:bg-green-950",
    danger: "bg-red-50 dark:bg-red-950",
    warning: "bg-yellow-50 dark:bg-yellow-950",
  }[variant];

  return (
    <Card className={bgClass}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Implementation Phases

### Phase 1: Core Data Model (Week 1)
- [ ] Convex schema setup
- [ ] Clerk organization integration
- [ ] Seed default categories for Pentecostal/Baptist
- [ ] Basic CRUD for transactions

### Phase 2: Import & Categorization (Week 2)
- [ ] CSV import with Papa Parse
- [ ] Auto-categorization engine
- [ ] Manual review queue
- [ ] Bulk categorization UI

### Phase 3: Dashboard & Reports (Week 3)
- [ ] Real-time dashboard with KPIs
- [ ] Monthly/annual summaries
- [ ] PDF export (use @react-pdf/renderer)
- [ ] Excel export (use xlsx library)

### Phase 4: Gift Aid (Week 4)
- [ ] Donor management
- [ ] Gift Aid declaration tracking
- [ ] Claim generation
- [ ] HMRC export format

### Phase 5: Polish & Advanced (Week 5+)
- [ ] Budget management
- [ ] Fund transfers
- [ ] Charts and trends
- [ ] Mobile responsive

---

## Start Here

```
Read this prompt and implement Phase 1:

1. Create the Convex schema (convex/schema.ts)
2. Create the seed data for default categories
3. Implement the church setup mutation that:
   - Creates a church linked to Clerk org
   - Seeds default categories
   - Creates a General fund

Show me the schema and seed functions first.
```
