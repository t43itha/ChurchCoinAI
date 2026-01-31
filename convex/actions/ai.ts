"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { GoogleGenAI, Type } from "@google/genai";
import { transactionRAG } from "../lib/ragInstance";

// Initialize Gemini AI with server-side API key
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured in Convex environment");
  }
  return new GoogleGenAI({ apiKey });
};

// Require an authenticated Convex user (protects all AI actions)
const requireUser = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: please sign in");
  }
  const { api } = await import("../_generated/api");
  const currentUser = await ctx.runQuery(api.queries.users.current, {});
  if (!currentUser) {
    throw new Error("Forbidden: complete onboarding first");
  }
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
      return JSON.parse(text);
    } catch (error) {
      console.error("Gemini Categorization Error:", error);
      return [];
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
        aiSuggestions = JSON.parse(text);
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
          aiSuggestions = JSON.parse(text);
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
      return text ? JSON.parse(text) : [];
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
      return text ? JSON.parse(text) : [];
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

    const eligible = JSON.parse(args.eligibleTransactions);

    if (eligible.length === 0) {
      return "No Gift Aid eligible transactions found for this period.";
    }

    // Aggregate by Donor
    const donorTotals: Record<string, number> = {};
    let totalClaimable = 0;

    eligible.forEach((t: any) => {
      const name = t.donorName || "Unknown Donor";
      donorTotals[name] = (donorTotals[name] || 0) + t.amount;
    });

    const breakdown = Object.entries(donorTotals).map(([donor, amount]) => {
      const claim = amount * 0.25;
      totalClaimable += claim;
      return { donor, totalDonation: amount, claimable: claim };
    });

    const prompt = `
      Create a formal Gift Aid Schedule summary for HMRC (UK tax authority).

      Period: ${args.startDate || "All Time"} to ${args.endDate || "Present"}

      Aggregated Data:
      ${JSON.stringify(breakdown)}

      Total Claimable Calculated: £${totalClaimable.toFixed(2)}

      Instructions:
      1. Create a Markdown table with columns: Donor Name, Total Donation (£), Gift Aid Claimable (£).
      2. Include a summary section at the bottom stating the Grand Total Claim.
      3. Add a brief declaration statement suitable for a charity treasurer.
      4. Keep the tone professional and compliant.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Treasurer's Report
export const generateTreasurerReport = action({
  args: {
    summaryData: v.string(), // JSON with totalIncome, totalExpenditure, fundsStatus, recentLargeTransactions
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const prompt = `
      Write a brief, professional Treasurer's Report for the Board of Trustees (approx 200 words).
      Use a reassuring but factual tone suitable for a UK Charity.
      Highlight the current financial health, any major expenses, and the status of restricted funds.
      Use this data: ${args.summaryData}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Project Impact Update
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

    const prompt = `
      Write a "Project Impact Update" for the '${args.fundName}' fund.
      Target Audience: Church members or newsletter subscribers.

      Financials:
      - Current Balance: £${args.fundBalance}
      - Period Income: £${args.periodIncome}
      - Period Spend: £${args.periodExpense}
      - Target: £${args.targetAmount || "N/A"}

      Key Activity (Transactions):
      ${args.recentTransactions}

      Instructions:
      1. Write an engaging title.
      2. Summarize progress towards the target (if applicable).
      3. Highlight key expenditures (what the money achieved).
      4. Thank donors for specific support.
      5. Format using Markdown.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Campaign Report
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

    const stats = {
      fundName: args.fundName,
      target: args.target || "Not Set",
      totalRaisedCash: args.totalRaisedCash,
      totalPledged: args.totalPledged,
      donorCount: args.donorCount,
      avgDonation: args.avgDonation.toFixed(2),
      deadline: args.deadline || "None",
    };

    const prompt = `
      Write a Strategic Campaign Fundraising Report for the '${args.fundName}'.

      Key Metrics:
      ${JSON.stringify(stats)}

      Instructions:
      1. Create a "Campaign Scorecard" table at the top with the key metrics.
      2. Analyze the progress against the Target.
      3. Project the likelihood of meeting the goal based on current pledges and cash.
      4. Provide a commentary on donor engagement (based on donor count).
      5. Suggest 2-3 brief next steps to boost fundraising.
      6. Use Markdown formatting.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Annual Statement (SOFA) - Updated for RCI category grouping
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
      ? JSON.parse(args.incomeByMainCategory)
      : JSON.parse(args.incomeByCategory);
    const expenditureData = args.expenditureByMainCategory
      ? JSON.parse(args.expenditureByMainCategory)
      : JSON.parse(args.expenditureByCategory);

    const data = {
      period: args.period,
      income: incomeData,
      expenditure: expenditureData,
      totals: {
        income: args.totalIncome,
        expenditure: args.totalExpenditure,
        net: args.totalIncome - args.totalExpenditure,
      },
    };

    const prompt = `
      Create a formal "Annual Statement of Financial Activities" (SOFA) report for RCI Missions.
      This is a standard financial report for a UK Charity following the RCI reporting structure.

      Data:
      ${JSON.stringify(data)}

      RCI Category Structure (if applicable):
      Income: Donations (Tithe, Offering, Thanksgiving), Building Fund, Charitable Activities, Other Income
      Expenditure: Major Programs, Ministry Costs, Staff & Volunteer Costs, Premises Costs, Mission Costs, Admin & Governance

      Instructions:
      1. Create a clear structure with "Incoming Resources" and "Resources Expended".
      2. Group categories by their main category (e.g., all donation types under "Donations").
      3. Present the breakdown in a hierarchical table format showing main categories and subcategories.
      4. Show the "Net Movement in Funds" at the bottom.
      5. Add a brief executive summary interpreting the numbers suitable for presentation to the Senior Pastor.
      6. Highlight any notable trends (largest income sources, key expenditure areas).
      7. Use professional Markdown formatting suitable for a formal church report.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Monthly Breakdown - Updated for RCI context
export const generateMonthlyBreakdown = action({
  args: {
    monthlyData: v.string(), // JSON array of { month, income, expense }
    categoryBreakdown: v.optional(v.string()), // Optional breakdown by mainCategory
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ai = getAI();

    const categoryContext = args.categoryBreakdown
      ? `\nCategory Breakdown by Month:\n${args.categoryBreakdown}`
      : '';

    const prompt = `
      Create a "Monthly Financial Performance" report for RCI Missions.

      Data (Time Series):
      ${args.monthlyData}
      ${categoryContext}

      RCI Category Context:
      Income categories: Donations (Tithe, Offering, Thanksgiving), Building Fund, Charitable Activities, Other Income
      Expenditure categories: Major Programs, Ministry Costs, Staff & Volunteer Costs, Premises Costs, Mission Costs, Admin & Governance

      Instructions:
      1. Present a Markdown table showing Month, Income, Expenditure, and Net Result for each month.
      2. Identify any seasonal trends or unusual months (e.g. "Highest income was in...").
      3. If category breakdown is provided, highlight which categories drove the trends.
      4. Provide a brief commentary on the consistency of cash flow.
      5. Note any months where expenditure exceeded income and suggest potential causes.
      6. Use professional Markdown suitable for presentation to church leadership.
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

    const systemInstruction = `
      You are "Steward", an AI assistant for a Church Treasurer.
      You are helpful, polite, and knowledgeable about UK charity accounting.
      You have access to the current financial data provided in the context.
      Answer questions based on this data. If you don't know, say so.
      Keep answers concise.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: `Context Data: ${args.contextData}\n\nUser Question: ${args.message}`,
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

    const reportData = JSON.parse(args.monthlyReportData);

    const prompt = `
      Create a narrative commentary for the RCI Missions Monthly Financial Report.
      This commentary will be presented to the Senior Pastor.

      Monthly Report Data:
      ${JSON.stringify(reportData, null, 2)}

      RCI Category Structure:
      Income: Donations (Tithe, Offering, Thanksgiving), Building Fund, Charitable Activities, Other Income
      Expenditure: Major Programs, Ministry Costs, Staff & Volunteer Costs, Premises Costs, Mission Costs, Admin & Governance

      Instructions:
      Create a concise (200-300 words) narrative that:

      1. **Opening Summary**: Start with a one-sentence summary of the month's financial position.

      2. **Income Highlights**:
         - Total income for the month
         - Notable changes in key categories (especially Tithes/Offerings)
         - Any significant one-time donations or new giving patterns

      3. **Expenditure Notes**:
         - Key expenditure areas
         - Any significant purchases or payments
         - Comparison to typical monthly spending

      4. **Gift Aid Update**:
         - Total Gift Aid eligible amount
         - Claimable amount from HMRC
         - Any action needed on Gift Aid declarations

      5. **Recommendations** (if any):
         - Suggest any actions the church leadership should consider
         - Flag any concerns (e.g., declining income trends, unexpected expenses)

      6. **Closing Statement**: End with a faith-affirming note appropriate for a church context.

      Format:
      - Use clear headers for each section
      - Use bullet points for key metrics
      - Be factual but warm in tone
      - Avoid financial jargon where possible
      - Use British English and GBP currency format (£)
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text;
  },
});
