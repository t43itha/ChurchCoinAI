"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { GoogleGenAI, Type } from "@google/genai";
import { transactionRAG } from "../lib/ragInstance";
import {
  safeJsonParse,
  validateGiftAidEligibleTransactions,
} from "../lib/aiValidation";
import {
  categorizeWithoutExternalAI,
  mergeGeminiFallback,
} from "../intelligence/categorization/pipeline";
import {
  buildGeminiCategorizationPrompt,
  CATEGORIZATION_MODEL,
} from "../intelligence/categorization/gemini";

const AI_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 40;

// Initialize Gemini AI with server-side API key
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured in Convex environment");
  }
  return new GoogleGenAI({ apiKey });
};

// Require an authenticated Convex user (protects all AI actions)
const requireUser = async (ctx: ActionCtx): Promise<Doc<"users">> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: please sign in");
  }
  const { api } = (await import("../_generated/api")) as any;
  const currentUser = await ctx.runQuery(api.queries.users.current, {});
  if (!currentUser) {
    throw new Error("Forbidden: complete onboarding first");
  }

  const { internal } = (await import("../_generated/api")) as any;
  const configuredLimit = Number(process.env.AI_RATE_LIMIT_PER_MINUTE);
  const perMinuteLimit =
    Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.floor(configuredLimit)
      : DEFAULT_AI_RATE_LIMIT_PER_MINUTE;

  await ctx.runMutation(internal.mutations.aiRateLimit.checkAndConsume, {
    organizationId: currentUser.organizationId,
    limit: perMinuteLimit,
    windowMs: AI_RATE_LIMIT_WINDOW_MS,
  });

  return currentUser;
};

// Check if API key is configured
export const hasApiKey = action({
  args: {},
  handler: async () => {
    return !!process.env.GEMINI_API_KEY;
  },
});

// Categorize transactions using AI
export const categorizeTransactions = action({
  args: {
    descriptions: v.array(v.string()),
    fundNames: v.array(v.string()),
    categories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const prompt = `
      You are an expert UK Charity Treasurer assistant.
      I have a list of bank transaction descriptions.
      For each description:
      1. Suggest the most appropriate Category and Fund Name.
      2. Determine if it is likely Gift Aid Eligible (Individual donations usually are, business/cash/grants usually aren't).
      3. Extract a Donor Name if present (e.g., "Ref: J SMITH" -> "J Smith").

      Available Categories: ${args.categories.join(", ")}
      Available Funds: ${args.fundNames.join(", ")}

      Rules:
      - "Tithe" or "Donation" from a person is usually Gift Aid eligible.
      - Utility bills go to General Fund / Utilities.
      - Specific project references (e.g. 'Roof', 'Building') go to that Fund.

      Input Descriptions:
      ${JSON.stringify(args.descriptions)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                fundName: { type: Type.STRING },
                confidence: { type: Type.STRING, description: "High, Medium, or Low" },
                isGiftAidEligible: { type: Type.BOOLEAN },
                donorName: { type: Type.STRING },
              },
            },
          },
          // Disable thinking mode to get clean JSON output
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text;
      if (!text) return [];
      return safeJsonParse<any[]>(text, "categorizeTransactions response");
    } catch (error) {
      console.error("Gemini Categorization Error:", error);
      return [];
    }
  },
});

// Preview the categorization pipeline, using Gemini only for unresolved rows.
export const categorizeWithPipelinePreview = action({
  args: {
    transactions: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        type: v.union(v.literal("Income"), v.literal("Expenditure")),
      })
    ),
    fundNames: v.array(v.string()),
    categories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { api } = (await import("../_generated/api")) as any;
    const [categoryDetails, funds] = await Promise.all([
      ctx.runQuery(api.queries.categories.listWithDetails, {}),
      ctx.runQuery(api.queries.funds.list, {}),
    ]);

    const initialSuggestions = await categorizeWithoutExternalAI(
      ctx,
      user.organizationId,
      args.transactions,
      categoryDetails,
      funds
    );
    const unresolvedTransactions = initialSuggestions
      .map((suggestion, index) =>
        suggestion.predictionSource === "none" ? args.transactions[index] : null
      )
      .filter((transaction): transaction is (typeof args.transactions)[number] =>
        Boolean(transaction)
      );

    if (unresolvedTransactions.length === 0) {
      return initialSuggestions;
    }

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: CATEGORIZATION_MODEL,
        contents: buildGeminiCategorizationPrompt(
          unresolvedTransactions,
          categoryDetails,
          funds,
          initialSuggestions.flatMap((suggestion) => suggestion.evidence)
        ),
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                fundName: { type: Type.STRING },
                confidence: {
                  type: Type.STRING,
                  description: "High, Medium, or Low",
                },
                isGiftAidEligible: { type: Type.BOOLEAN },
                donorName: { type: Type.STRING },
                evidence: { type: Type.STRING },
              },
            },
          },
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const rawGeminiSuggestions = response.text
        ? safeJsonParse<Record<string, unknown>[]>(
            response.text,
            "categorizeWithPipelinePreview response"
          )
        : [];

      return mergeGeminiFallback(
        initialSuggestions,
        rawGeminiSuggestions,
        args.transactions,
        categoryDetails,
        funds
      );
    } catch (error) {
      console.error(
        "Gemini pipeline fallback failed; returning non-AI categorization suggestions.",
        error
      );
      return initialSuggestions;
    }
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

// Enhanced categorization with donor and pledge matching
export const categorizeWithMatching = action({
  args: {
    transactions: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        type: v.union(v.literal("Income"), v.literal("Expenditure")),
      })
    ),
    fundNames: v.array(v.string()),
    categories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const ai = getAI();
    const { api } = await import("../_generated/api");

    // Only process income transactions for donor matching
    const descriptions = args.transactions.map((t) => t.description);

    const prompt = `
      You are an expert UK Charity Treasurer assistant.
      I have a list of bank transaction descriptions.
      For each description:
      1. Suggest the most appropriate Category and Fund Name.
      2. Determine if it is likely Gift Aid Eligible (Individual donations usually are, business/cash/grants usually aren't).
      3. Extract a Donor Name if present (e.g., "Ref: J SMITH" -> "J Smith", "FT-JOHN DOE" -> "John Doe").

      Available Categories: ${args.categories.join(", ")}
      Available Funds: ${args.fundNames.join(", ")}

      Rules:
      - "Tithe" or "Donation" from a person is usually Gift Aid eligible.
      - Utility bills go to General Fund / Utilities.
      - Specific project references (e.g. 'Roof', 'Building') go to that Fund.
      - Look for names after patterns like "Ref:", "FT-", "TFR", or at the start/end of descriptions.

      Input Descriptions:
      ${JSON.stringify(descriptions)}
    `;

    let aiSuggestions: any[] = [];
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                fundName: { type: Type.STRING },
                confidence: {
                  type: Type.STRING,
                  description: "High, Medium, or Low",
                },
                isGiftAidEligible: { type: Type.BOOLEAN },
                donorName: { type: Type.STRING },
              },
            },
          },
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text;
      if (text) {
        aiSuggestions = safeJsonParse<any[]>(
          text,
          "categorizeWithMatching response"
        );
      }
    } catch (error) {
      console.error("Gemini Categorization Error:", error);
    }

    // Fetch existing donors and pledges for matching
    const [donors, pledges, funds] = await Promise.all([
      ctx.runQuery(api.queries.donors.list, {}),
      ctx.runQuery(api.queries.pledges.list, {}),
      ctx.runQuery(api.queries.funds.list, {}),
    ]);

    // Create fund name to ID mapping
    const fundNameToId = new Map<string, string>();
    for (const fund of funds) {
      fundNameToId.set(fund.name.toLowerCase(), fund._id);
    }

    // Build enhanced results with donor/pledge matching
    const results = args.transactions.map((transaction, index) => {
      const suggestion = aiSuggestions[index] || {};
      const extractedDonorName = suggestion.donorName || null;
      const suggestedFundName = suggestion.fundName || "";

      let matchedDonor: any = null;
      let matchedPledge: any = null;
      let isNewDonor = false;

      // Only match donors for income transactions with extracted names
      if (transaction.type === "Income" && extractedDonorName) {
        const normalized = normalizeName(extractedDonorName);

        // Try to find matching donor
        matchedDonor = donors.find(
          (d: any) => normalizeName(d.name) === normalized
        );

        if (!matchedDonor) {
          matchedDonor = donors.find((d: any) => {
            const donorNormalized = normalizeName(d.name);
            return (
              donorNormalized.includes(normalized) ||
              normalized.includes(donorNormalized)
            );
          });
        }

        if (!matchedDonor) {
          const inputWords = normalized.split(" ").filter((w) => w.length > 1);
          matchedDonor = donors.find((d: any) => {
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

        // If no match, flag as new donor
        if (!matchedDonor) {
          isNewDonor = true;
        }

        // Try to match pledge if donor found
        if (matchedDonor) {
          const donorPledges = pledges.filter(
            (p: any) =>
              p.donorId === matchedDonor._id && p.status === "Active"
          );

          // Find pledge with matching fund and similar amount
          const suggestedFundId = fundNameToId.get(
            suggestedFundName.toLowerCase()
          );

          for (const pledge of donorPledges) {
            // Check fund match (if suggested)
            const fundMatches =
              !suggestedFundId || pledge.fundId === suggestedFundId;

            // Check amount match (within 10% tolerance for recurring, exact for one-off)
            const amountDiff = Math.abs(pledge.amount - transaction.amount);
            const tolerance =
              pledge.frequency === "One-off" ? 0.01 : pledge.amount * 0.1;
            const amountMatches = amountDiff <= tolerance;

            if (fundMatches && amountMatches) {
              matchedPledge = pledge;
              break;
            }
          }
        }
      }

      return {
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        category: suggestion.category || "",
        fundName: suggestedFundName,
        confidence: suggestion.confidence || "Low",
        isGiftAidEligible: suggestion.isGiftAidEligible ?? false,
        extractedDonorName,
        matchedDonorId: matchedDonor?._id || null,
        matchedDonorName: matchedDonor?.name || null,
        isNewDonor,
        matchedPledgeId: matchedPledge?._id || null,
        matchedPledgeName: matchedPledge
          ? `${matchedPledge.donorName} - £${matchedPledge.amount}`
          : null,
      };
    });

    return results;
  },
});

// RAG-enhanced categorization with semantic similarity search
// This version learns from existing transactions and reduces Gemini API calls
export const categorizeWithRAG = action({
  args: {
    transactions: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        type: v.union(v.literal("Income"), v.literal("Expenditure")),
      })
    ),
    fundNames: v.array(v.string()),
    categories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const ai = getAI();
    const { api } = await import("../_generated/api");

    const namespace = `org_${user.organizationId}`;

    // STEP 1: Search RAG for similar transactions
    const ragResults: Map<number, any[]> = new Map();
    const needsAI: number[] = [];

    for (let i = 0; i < args.transactions.length; i++) {
      const tx = args.transactions[i];

      try {
        // Find similar past transactions using semantic search
        const searchResponse = await transactionRAG.search(ctx, {
          query: tx.description,
          namespace,
          limit: 3,
        });

        // Access the results array from the search response
        const results = searchResponse.results || [];

        // Filter results by score threshold
        const highConfidenceResults = results.filter(
          (r: any) => r.score >= 0.85
        );

        if (highConfidenceResults.length > 0 && highConfidenceResults[0].score >= 0.9) {
          // High confidence match - use RAG result
          ragResults.set(i, highConfidenceResults);
        } else {
          // Low confidence - needs Gemini
          needsAI.push(i);
          // Still store lower-confidence results for context
          if (results.length > 0) {
            ragResults.set(i, results);
          }
        }
      } catch (error) {
        console.log("RAG search failed for transaction, falling back to Gemini:", error);
        needsAI.push(i);
      }
    }

    // STEP 2: Build context from RAG results for Gemini
    const buildRAGContext = () => {
      const examples: string[] = [];
      ragResults.forEach((results, idx) => {
        if (results.length > 0) {
          const best = results[0];
          examples.push(
            `"${args.transactions[idx].description}" -> Category: ${best.document?.category || "Unknown"}`
          );
        }
      });
      return examples.slice(0, 10).join("\n"); // Limit context size
    };

    // STEP 3: Call Gemini only for unmatched transactions
    let aiSuggestions: any[] = [];
    if (needsAI.length > 0) {
      const ragContext = buildRAGContext();
      const txsNeedingAI = needsAI.map((i) => args.transactions[i]);

      const prompt = `
        You are an expert UK Charity Treasurer assistant.
        I have a list of bank transaction descriptions.
        For each description:
        1. Suggest the most appropriate Category and Fund Name.
        2. Determine if it is likely Gift Aid Eligible (Individual donations usually are, business/cash/grants usually aren't).
        3. Extract a Donor Name if present (e.g., "Ref: J SMITH" -> "J Smith", "FT-JOHN DOE" -> "John Doe").

        ${ragContext ? `Here are examples of how this organization categorizes similar transactions:\n${ragContext}\n` : ""}

        Available Categories: ${args.categories.join(", ")}
        Available Funds: ${args.fundNames.join(", ")}

        Rules:
        - "Tithe" or "Donation" from a person is usually Gift Aid eligible.
        - Utility bills go to General Fund / Utilities.
        - Specific project references (e.g. 'Roof', 'Building') go to that Fund.
        - Look for names after patterns like "Ref:", "FT-", "TFR", or at the start/end of descriptions.

        Input Descriptions:
        ${JSON.stringify(txsNeedingAI.map((t) => t.description))}
      `;

      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  category: { type: Type.STRING },
                  fundName: { type: Type.STRING },
                  confidence: {
                    type: Type.STRING,
                    description: "High, Medium, or Low",
                  },
                  isGiftAidEligible: { type: Type.BOOLEAN },
                  donorName: { type: Type.STRING },
                },
              },
            },
            thinkingConfig: { thinkingBudget: 0 },
          },
        });

        const text = response.text;
        if (text) {
          aiSuggestions = safeJsonParse<any[]>(
            text,
            "categorizeWithRAG response"
          );
        }
      } catch (error) {
        console.error("Gemini Categorization Error:", error);
      }
    }

    // Fetch funds for mapping
    const funds = await ctx.runQuery(api.queries.funds.list, {});
    const fundNameToId = new Map<string, string>();
    for (const fund of funds) {
      fundNameToId.set(fund.name.toLowerCase(), fund._id);
    }

    // STEP 4: Combine results
    let aiIndex = 0;
    const results = args.transactions.map((tx, i) => {
      const ragMatch = ragResults.get(i);
      const isAINeeded = needsAI.includes(i);

      if (ragMatch && ragMatch.length > 0 && ragMatch[0].score >= 0.9) {
        // Use RAG result for high-confidence matches
        const best = ragMatch[0];
        const doc = best.document || {};

        return {
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: doc.category || "",
          fundName: "", // Will be mapped from fundId
          confidence: best.score >= 0.95 ? "High" : "Medium",
          isGiftAidEligible: doc.isGiftAidEligible ?? false,
          extractedDonorName: doc.donorName || null,
          predictionSource: "rag" as const,
          ragScore: best.score,
          matchedDonorId: null,
          matchedDonorName: null,
          isNewDonor: false,
          matchedPledgeId: null,
          matchedPledgeName: null,
        };
      } else if (isAINeeded) {
        // Use Gemini result
        const suggestion = aiSuggestions[aiIndex] || {};
        aiIndex++;

        const suggestedFundName = suggestion.fundName || "";
        const fundId = fundNameToId.get(suggestedFundName.toLowerCase());

        return {
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: suggestion.category || "",
          fundName: suggestedFundName,
          confidence: suggestion.confidence || "Low",
          isGiftAidEligible: suggestion.isGiftAidEligible ?? false,
          extractedDonorName: suggestion.donorName || null,
          predictionSource: "gemini" as const,
          ragScore: undefined,
          matchedDonorId: null,
          matchedDonorName: null,
          isNewDonor: Boolean(suggestion.donorName),
          matchedPledgeId: null,
          matchedPledgeName: null,
        };
      } else {
        // Should not happen, but fallback
        return {
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: "",
          fundName: "",
          confidence: "Low",
          isGiftAidEligible: false,
          extractedDonorName: null,
          predictionSource: "none" as const,
          ragScore: undefined,
          matchedDonorId: null,
          matchedDonorName: null,
          isNewDonor: false,
          matchedPledgeId: null,
          matchedPledgeName: null,
        };
      }
    });

    // Log stats
    const ragMatches = results.filter((r) => r.predictionSource === "rag").length;
    const geminiMatches = results.filter((r) => r.predictionSource === "gemini").length;
    console.log(`RAG Categorization: ${ragMatches} RAG matches, ${geminiMatches} Gemini calls`);

    return results;
  },
});

// Generate strategic insights for dashboard
export const generateInsights = action({
  args: {
    transactionData: v.string(), // JSON string of transactions
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const prompt = `
      Analyze these transactions and provide 3 "Decision Ready" strategic insights for the Treasurer.

      Focus on these specific areas:
      1. Donor Momentum: Are we gaining or losing regular givers compared to previous months?
      2. Fund Alerts: Are any restricted funds falling behind schedule or running low?
      3. Cash Flow: Are there any unusual spending spikes or drops in income?

      Return JSON array of objects with 'title', 'description', 'type' (warning, info, success).
      Transactions: ${args.transactionData}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["warning", "info", "success"] },
              },
            },
          },
          // Disable thinking mode to get clean JSON output
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text;
      return text
        ? safeJsonParse<any[]>(text, "generateInsightRecommendations response")
        : [];
    } catch (e) {
      console.error("Insight generation failed", e);
      return [];
    }
  },
});

// Reconcile pledges with transactions (fetches data server-side)
export const reconcilePledges = action({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const ai = getAI();

    // Fetch unlinked income and pledges server-side
    const { api } = await import("../_generated/api");
    const [candidates, pledgeList] = await Promise.all([
      ctx.runQuery(api.queries.pledges.getUnlinkedIncomeForMatching, {}),
      ctx.runQuery(api.queries.pledges.list, {}),
    ]);

    if (candidates.length === 0) return [];

    const prompt = `
      I have a list of Transactions and a list of Pledges/Donors.
      Match the Transactions to the Pledges based on donor name similarity or amount patterns.
      Only include matches where you are reasonably confident.
      Return a JSON array of matches.

      Transactions: ${JSON.stringify(candidates)}
      Pledges: ${JSON.stringify(pledgeList)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                transactionId: { type: Type.STRING },
                pledgeId: { type: Type.STRING },
                donorName: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
          // Disable thinking mode to get clean JSON output
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text;
      return text
        ? safeJsonParse<any[]>(text, "reconcilePledges response")
        : [];
    } catch (e) {
      console.error("Reconciliation failed", e);
      return [];
    }
  },
});

// Generate Gift Aid schedule for HMRC
export const generateGiftAidSchedule = action({
  args: {
    eligibleTransactions: v.string(), // JSON array
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const parsedEligible = safeJsonParse<unknown>(
      args.eligibleTransactions,
      "eligibleTransactions"
    );
    const eligible = validateGiftAidEligibleTransactions(parsedEligible);

    if (eligible.length === 0) {
      return "No Gift Aid eligible transactions found for this period.";
    }

    // Aggregate by Donor
    const donorTotals: Record<string, number> = {};
    let totalClaimable = 0;

    eligible.forEach((t) => {
      const name = t.donorName || "Unknown Donor";
      donorTotals[name] = (donorTotals[name] || 0) + t.amount;
    });

    const breakdown = Object.entries(donorTotals).map(([donor, amount]) => {
      const claim = amount * 0.25;
      totalClaimable += claim;
      return { donor, totalDonation: amount, claimable: claim };
    });

    const totalDonations = breakdown.reduce((sum: number, b: { totalDonation: number }) => sum + b.totalDonation, 0);

    const prompt = `
You are creating a Gift Aid report that church leadership can understand. Gift Aid is a UK scheme where HMRC refunds 25% of eligible donations to charities.

**Period**: ${args.startDate || "All Time"} to ${args.endDate || "Present"}
**Total Eligible Donations**: £${totalDonations.toFixed(2)}
**Total We Can Claim Back**: £${totalClaimable.toFixed(2)}

**Donor Breakdown**:
${JSON.stringify(breakdown, null, 2)}

**Write in this structure**:

## Gift Aid Summary

### What is Gift Aid? 🎁
One sentence explanation: "Gift Aid lets us claim back 25p for every £1 donated by UK taxpayers - at no extra cost to them."

### The Good News
Highlight the key number: "This period, we can claim **£${totalClaimable.toFixed(2)}** from HMRC!"
This is essentially free money for the church from the government.

### Who's Helping Us Claim
Create a simple table:
| Donor | Their Giving | Our Claim (25%) |
|-------|-------------|-----------------|

### Summary Totals
- Total eligible donations: £${totalDonations.toFixed(2)}
- Total claimable from HMRC: £${totalClaimable.toFixed(2)}
- Number of Gift Aid givers: ${breakdown.length}

### Action Required
- Is this ready to submit to HMRC?
- Any missing Gift Aid declarations we should chase?
- When should we submit this claim?

### Quick Reminder
"All donors listed above have signed Gift Aid declarations confirming they are UK taxpayers. We can legally claim this amount."

**Tone**: Professional but accessible. Help non-accountants understand why Gift Aid matters.
**Length**: 200-250 words plus the table.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Treasurer's Report - Layman-friendly version for church leadership
export const generateTreasurerReport = action({
  args: {
    summaryData: v.string(), // JSON with totalIncome, totalExpenditure, fundsStatus, recentLargeTransactions
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const data = safeJsonParse<Record<string, any>>(args.summaryData, "summaryData");
    const netPosition = data.totalIncome - data.totalExpenditure;
    const isHealthy = netPosition >= 0;

    const prompt = `
You are writing a financial update for church leadership (Senior Pastor, Elders, Trustees) who are NOT accountants.

**Your job**: Explain the church's financial health in plain English. Avoid jargon. Be warm, factual, and encouraging where appropriate.

**Financial Data**:
- Money received this period: £${data.totalIncome?.toLocaleString() || 0}
- Money spent this period: £${data.totalExpenditure?.toLocaleString() || 0}
- Net position: ${isHealthy ? 'Surplus' : 'Deficit'} of £${Math.abs(netPosition).toLocaleString()}
- Fund balances: ${JSON.stringify(data.fundsStatus || [])}
- Notable transactions (over £500): ${JSON.stringify(data.recentLargeTransactions || [])}

**Write in this structure** (use clear headers, short paragraphs, bullet points):

## Financial Health at a Glance
One sentence summary: Are we in good shape, tight, or need attention?

## What Came In
- Total received and main sources (tithes, offerings, special gifts)
- Any notable donations to highlight

## What Went Out
- Total spent and main areas (ministry, premises, staff)
- Any significant purchases or payments

## Our Funds
Brief status of each fund - are they healthy, growing, or need attention?

## What This Means
1-2 sentences translating the numbers into plain terms (e.g., "We have enough to cover X months of operations")

## Prayer Points (optional)
If there are concerns, frame them positively as prayer needs.

**Tone**: Warm, clear, faithful. Like a trusted friend explaining the finances over coffee.
**Length**: 200-300 words maximum.
**Currency**: Use £ (British Pounds).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Project Impact Update - Newsletter-friendly for congregation
export const generateProjectReport = action({
  args: {
    fundName: v.string(),
    fundBalance: v.number(),
    targetAmount: v.optional(v.number()),
    periodIncome: v.number(),
    periodExpense: v.number(),
    recentTransactions: v.string(), // JSON array
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const progressPercent = args.targetAmount
      ? Math.round((args.fundBalance / args.targetAmount) * 100)
      : null;

    const prompt = `
You are writing a project update for a church newsletter or announcement. The audience is everyday church members who gave to this project and want to know how their money is being used.

**Project**: ${args.fundName}
**Current Balance**: £${args.fundBalance.toLocaleString()}
**Target Amount**: ${args.targetAmount ? `£${args.targetAmount.toLocaleString()}` : 'No specific target'}
${progressPercent ? `**Progress**: ${progressPercent}% of target reached` : ''}
**Recently Received**: £${args.periodIncome.toLocaleString()}
**Recently Spent**: £${args.periodExpense.toLocaleString()}
**Recent Activity**: ${args.recentTransactions}

**Write in this structure**:

## [Creative, Engaging Title about ${args.fundName}]
One sentence hook that celebrates progress or creates anticipation.

### Where We Are
- Visual progress indicator in words (e.g., "We're 75% of the way there!")
- Current balance explained simply

### What Your Giving Achieved
- Bullet points of what the money bought or enabled
- Focus on IMPACT, not just expenses (e.g., "New chairs for the youth room" not "£500 furniture")

### What's Next
- What the remaining funds will be used for
- Any upcoming milestones

### Thank You
Brief, heartfelt thanks to everyone who contributed. Make givers feel good about their investment.

**Tone**: Celebratory, grateful, clear. Like an excited update to friends.
**Length**: 150-200 words.
**Avoid**: Financial jargon, deficit language if possible, complex numbers.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Campaign Report - Strategic analysis for leadership
export const generateCampaignReport = action({
  args: {
    fundName: v.string(),
    target: v.optional(v.number()),
    totalRaisedCash: v.number(),
    totalPledged: v.number(),
    donorCount: v.number(),
    avgDonation: v.number(),
    deadline: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const totalCommitted = args.totalRaisedCash + args.totalPledged;
    const progressPercent = args.target ? Math.round((totalCommitted / args.target) * 100) : null;
    const cashPercent = args.target ? Math.round((args.totalRaisedCash / args.target) * 100) : null;

    const prompt = `
You are writing a fundraising campaign status report for church leadership (Pastor, Elders, Finance Team). They need to understand how the campaign is going and what actions to take.

**Campaign**: ${args.fundName}
**Target**: ${args.target ? `£${args.target.toLocaleString()}` : 'No target set'}
**Cash Received**: £${args.totalRaisedCash.toLocaleString()}${cashPercent ? ` (${cashPercent}% of target)` : ''}
**Pledges Outstanding**: £${args.totalPledged.toLocaleString()}
**Total Committed**: £${totalCommitted.toLocaleString()}${progressPercent ? ` (${progressPercent}% of target)` : ''}
**Number of Givers**: ${args.donorCount}
**Average Gift**: £${args.avgDonation.toFixed(0)}
**Deadline**: ${args.deadline || 'No deadline set'}

**Write in this structure**:

## Campaign Snapshot: ${args.fundName}

### The Numbers at a Glance
Create a simple visual summary using emojis/text:
- 💰 Cash in hand: £X
- 📝 Promised (pledges): £X
- 🎯 Target: £X
- 📊 Progress: X% (use a text progress bar like [████░░░░░░] 40%)

### How Are We Doing?
- Plain English assessment: On track? Behind? Ahead?
- Compare cash vs pledges - are pledges being fulfilled?
- Is the average gift healthy? Could we encourage larger gifts?

### Who's Giving?
- ${args.donorCount} people have contributed
- What does this tell us about engagement?
- Are we reaching enough people?

### Recommended Actions
3 specific, practical next steps the leadership can take. Be concrete:
- "Send a reminder to pledge holders this week"
- "Share an update in Sunday's service"
- "Consider a match-funding challenge"

### Outlook
One sentence: Will we hit the target? What needs to happen?

**Tone**: Strategic but accessible. Assume they understand business basics but not accounting.
**Length**: 250-350 words.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Annual Statement - Leadership-friendly year in review
export const generateAnnualStatement = action({
  args: {
    period: v.string(),
    incomeByCategory: v.string(), // JSON object - can include mainCategory grouping
    expenditureByCategory: v.string(), // JSON object - can include mainCategory grouping
    totalIncome: v.number(),
    totalExpenditure: v.number(),
    incomeByMainCategory: v.optional(v.string()), // Optional RCI-style grouped data
    expenditureByMainCategory: v.optional(v.string()), // Optional RCI-style grouped data
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    // Use mainCategory grouping if provided, otherwise fall back to standard categories
    const incomeData = args.incomeByMainCategory
      ? safeJsonParse<Record<string, any>>(
          args.incomeByMainCategory,
          "incomeByMainCategory"
        )
      : safeJsonParse<Record<string, any>>(
          args.incomeByCategory,
          "incomeByCategory"
        );
    const expenditureData = args.expenditureByMainCategory
      ? safeJsonParse<Record<string, any>>(
          args.expenditureByMainCategory,
          "expenditureByMainCategory"
        )
      : safeJsonParse<Record<string, any>>(
          args.expenditureByCategory,
          "expenditureByCategory"
        );

    const netMovement = args.totalIncome - args.totalExpenditure;
    const isPositive = netMovement >= 0;

    const prompt = `
You are writing an annual financial summary for church leadership (Senior Pastor, Elders, Trustees). They want to understand the year's financial story without needing an accounting degree.

**Period**: ${args.period}
**Total Money Received**: £${args.totalIncome.toLocaleString()}
**Total Money Spent**: £${args.totalExpenditure.toLocaleString()}
**Net Result**: ${isPositive ? 'Surplus' : 'Shortfall'} of £${Math.abs(netMovement).toLocaleString()}

**Income Breakdown by Category**:
${JSON.stringify(incomeData, null, 2)}

**Expenditure Breakdown by Category**:
${JSON.stringify(expenditureData, null, 2)}

**Write in this structure**:

## The Year in Numbers

### Executive Summary
2-3 sentences that a busy Pastor could read and understand the church's financial year. Was it a good year? Did we grow? Any concerns?

### Where the Money Came From (Income)
Present as a simple list with amounts and percentages of total:
- Tithes & Offerings: £X (Y%)
- Building Fund: £X (Y%)
- etc.

Highlight the top 2-3 sources. Add a brief note on any notable changes or gifts.

### Where the Money Went (Expenditure)
Present as a simple list grouped by purpose:
- Ministry & Programs: £X (Y%)
- Building & Premises: £X (Y%)
- Staff: £X (Y%)
- etc.

Highlight where most money was invested. Emphasise mission/ministry spending positively.

### The Bottom Line
- Did we end the year with more or less than we started?
- Explain what this means in practical terms
- Any reserves? How many months could we operate?

### Key Highlights
Bullet points of 3-4 notable financial achievements or milestones.

### Areas to Watch
If any concerns (declining income, growing costs), mention them constructively with suggested actions.

**Tone**: Professional yet accessible. Celebratory where appropriate. Honest about challenges.
**Length**: 400-500 words.
**Formatting**: Use clear headers, bullet points, and bold for key figures.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Monthly Breakdown - Trend analysis for leadership
export const generateMonthlyBreakdown = action({
  args: {
    monthlyData: v.string(), // JSON array of { month, income, expense }
    categoryBreakdown: v.optional(v.string()), // Optional breakdown by mainCategory
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const data = safeJsonParse<Array<{ income: number; expense: number }>>(
      args.monthlyData,
      "monthlyData"
    );
    const totalIncome = data.reduce((sum: number, m: { income: number }) => sum + m.income, 0);
    const totalExpense = data.reduce((sum: number, m: { expense: number }) => sum + m.expense, 0);
    const avgMonthlyIncome = totalIncome / data.length;
    const avgMonthlyExpense = totalExpense / data.length;

    const categoryContext = args.categoryBreakdown
      ? `\nCategory Breakdown by Month:\n${args.categoryBreakdown}`
      : '';

    const prompt = `
You are writing a month-by-month financial analysis for church leadership. They want to spot trends and understand the rhythm of church finances without being overwhelmed by numbers.

**Monthly Data**:
${args.monthlyData}

**Quick Stats**:
- Average monthly income: £${avgMonthlyIncome.toLocaleString()}
- Average monthly spending: £${avgMonthlyExpense.toLocaleString()}
- Total months covered: ${data.length}
${categoryContext}

**Write in this structure**:

## Monthly Financial Rhythm

### Overview
One paragraph: What's the overall pattern? Is income consistent? Seasonal? Growing or declining?

### Month-by-Month Summary
Create a simple table:
| Month | Money In | Money Out | Result |
|-------|----------|-----------|--------|
Use ✅ for surplus months, ⚠️ for deficit months.

### Trends We're Seeing
Highlight 2-3 key patterns in plain language:
- "Summer months tend to be quieter for giving"
- "December saw our biggest giving month"
- "Spending has been consistent at around £X/month"

### Best & Worst Months
- 📈 Strongest month: [Month] - What happened?
- 📉 Challenging month: [Month] - Why?

### Cash Flow Health
Simple assessment:
- Are we covering our monthly costs?
- Any months where we dipped into reserves?
- Are we building up savings or drawing them down?

### What This Tells Us
2-3 practical insights:
- "We should plan for lower giving in August"
- "Our regular givers provide a stable base of £X"
- "One-off gifts in December made a big difference"

**Tone**: Insightful, practical, non-alarming. Help leaders understand the patterns.
**Length**: 300-400 words.
**Avoid**: Complex financial terms, percentages where not helpful.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Donor Thank You Communication
export const generateDonorCommunication = action({
  args: {
    donorName: v.string(),
    totalGiven: v.number(),
    recentDonations: v.string(), // JSON array
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const prompt = `
      Write a polite, warm "Thank You" email to a donor named ${args.donorName}.
      They have given a total of £${args.totalGiven}.
      Recent donations: ${args.recentDonations}

      Tone: Grateful, professional, Christian charity context.
      Mention specifically how their support helps the church/charity.
      Do not include placeholders like [Date] - just use today's context or keep it general.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Pledge Completion Message (WhatsApp/SMS)
export const generatePledgeCompletionMessage = action({
  args: {
    donorName: v.string(),
    pledgeAmount: v.number(),
    fundName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const prompt = `
      Write a short, celebratory message for WhatsApp/SMS to a donor named ${args.donorName}.
      They have just successfully completed their pledge of £${args.pledgeAmount} for the '${args.fundName}' fund.

      Constraints:
      - Max 50 words.
      - Warm, Christian charity tone.
      - Include 1-2 appropriate emojis.
      - No placeholders like [Date].
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Chat with Treasurer AI Assistant
export const chatWithTreasurer = action({
  args: {
    message: v.string(),
    contextData: v.string(), // JSON with funds and recent transactions
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();
    const message = args.message.trim();

    if (!message) {
      throw new Error("Message cannot be empty");
    }
    if (message.length > 2000) {
      throw new Error("Message is too long");
    }
    if (args.contextData.length > 100_000) {
      throw new Error("Context data is too large");
    }

    const parsedContext = safeJsonParse<Record<string, unknown>>(
      args.contextData,
      "contextData"
    );

    const systemInstruction = `
      You are "Steward", an AI assistant for a Church Treasurer.
      You are helpful, polite, and knowledgeable about UK charity accounting.
      You have access to the current financial data provided in the context.
      Answer questions based on this data. If you don't know, say so.
      Keep answers concise.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Financial context data (JSON):",
            },
            {
              text: JSON.stringify(parsedContext),
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              text: "Treasurer question:",
            },
            {
              text: message,
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text;
  },
});

// Generate RCI Monthly Narrative Commentary
// Creates narrative commentary suitable for Senior Pastor presentation
export const generateRCIMonthlyNarrative = action({
  args: {
    monthlyReportData: v.string(), // JSON string of MonthlyReportData
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const reportData = safeJsonParse<Record<string, any>>(
      args.monthlyReportData,
      "monthlyReportData"
    );
    const netPosition = reportData.totals?.grossIncome - reportData.totals?.totalExpenditure;

    const prompt = `
You are writing a monthly financial update for the Senior Pastor. They need to quickly understand how the church did financially this month without getting lost in accounting details.

**Month**: ${reportData.monthName} ${reportData.year}
**Total Received**: £${reportData.totals?.grossIncome?.toLocaleString() || 0}
**Total Spent**: £${reportData.totals?.totalExpenditure?.toLocaleString() || 0}
**Net Position**: ${netPosition >= 0 ? 'Surplus' : 'Shortfall'} of £${Math.abs(netPosition).toLocaleString()}
**Gift Aid Eligible**: £${reportData.giftAidSummary?.eligible?.toLocaleString() || 0}
**HMRC Claimable**: £${reportData.giftAidSummary?.claimable?.toLocaleString() || 0}

**Income by Category**:
${JSON.stringify(reportData.receipts, null, 2)}

**Expenditure by Category**:
${JSON.stringify(reportData.payments, null, 2)}

**Weekly Breakdown**:
${JSON.stringify(reportData.weeklyBreakdown, null, 2)}

**Named Tithes/Offerings**:
${JSON.stringify(reportData.tithes, null, 2)}

**Write in this structure**:

## ${reportData.monthName} Financial Summary

### One-Line Summary
Start with a single sentence a busy pastor could read: "This month we received £X and spent £Y, leaving us with a [surplus/shortfall] of £Z."

### Giving Highlights 💝
- Total received: £X
- Main sources: Tithes (£X), Offerings (£X), etc.
- Any notable gifts or patterns?
- How does this compare to a typical month? (better/similar/lower)

### Where Funds Went 💸
- Main spending areas in plain terms
- Any significant one-off payments?
- Were there any unexpected costs?

### Gift Aid Bonus 🎁
Explain Gift Aid simply: "Because our givers signed Gift Aid declarations, we can claim an extra £X from HMRC - essentially free money for the church!"
- Amount eligible: £X
- Claimable: £X (this is 25% the government gives us back)

### Things to Note
Any items the Pastor should be aware of:
- Upcoming large payments
- Concerns about giving trends
- Good news to celebrate

### Suggested Actions
If relevant, 1-2 simple recommendations:
- "Remind congregation about Gift Aid signup"
- "Consider a giving update in the bulletin"

### Closing Reflection
End with a brief, faith-affirming statement appropriate for a church context. Express gratitude for the congregation's faithfulness.

**Tone**: Warm, clear, pastoral. Like a trusted treasurer having a 5-minute chat with the pastor.
**Length**: 250-350 words.
**Format**: Use headers, bullets, and emojis sparingly for scannability.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});
