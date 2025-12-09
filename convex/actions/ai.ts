"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini AI with server-side API key
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured in Convex environment");
  }
  return new GoogleGenAI({ apiKey });
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

// Generate strategic insights for dashboard
export const generateInsights = action({
  args: {
    transactionData: v.string(), // JSON string of transactions
  },
  handler: async (ctx, args) => {
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
      model: "gemini-2.5-flash",
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
    const ai = getAI();

    const prompt = `
      Write a brief, professional Treasurer's Report for the Board of Trustees (approx 200 words).
      Use a reassuring but factual tone suitable for a UK Charity.
      Highlight the current financial health, any major expenses, and the status of restricted funds.
      Use this data: ${args.summaryData}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Annual Statement (SOFA)
export const generateAnnualStatement = action({
  args: {
    period: v.string(),
    incomeByCategory: v.string(), // JSON object
    expenditureByCategory: v.string(), // JSON object
    totalIncome: v.number(),
    totalExpenditure: v.number(),
  },
  handler: async (ctx, args) => {
    const ai = getAI();

    const data = {
      period: args.period,
      income: JSON.parse(args.incomeByCategory),
      expenditure: JSON.parse(args.expenditureByCategory),
      totals: {
        income: args.totalIncome,
        expenditure: args.totalExpenditure,
        net: args.totalIncome - args.totalExpenditure,
      },
    };

    const prompt = `
      Create a formal "Annual Statement of Financial Activities" (SOFA) report.
      This is a standard financial report for a UK Charity.

      Data:
      ${JSON.stringify(data)}

      Instructions:
      1. Create a clear structure with "Incoming Resources" and "Resources Expended".
      2. Present the breakdown by Category in a table format.
      3. Show the "Net Movement in Funds" at the bottom.
      4. Add a brief executive summary interpreting the numbers (e.g., did we break even? where did most money come from?).
      5. Use professional Markdown formatting.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text;
  },
});

// Generate Monthly Breakdown
export const generateMonthlyBreakdown = action({
  args: {
    monthlyData: v.string(), // JSON array of { month, income, expense }
  },
  handler: async (ctx, args) => {
    const ai = getAI();

    const prompt = `
      Create a "Monthly Financial Performance" report.

      Data (Time Series):
      ${args.monthlyData}

      Instructions:
      1. Present a Markdown table showing Month, Income, Expenditure, and Net Result for each month.
      2. Identify any seasonal trends or unusual months (e.g. "Highest income was in...").
      3. Provide a brief commentary on the consistency of cash flow.
      4. Use professional Markdown.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash",
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
    const ai = getAI();

    const systemInstruction = `
      You are "Steward", an AI assistant for a Church Treasurer.
      You are helpful, polite, and knowledgeable about UK charity accounting.
      You have access to the current financial data provided in the context.
      Answer questions based on this data. If you don't know, say so.
      Keep answers concise.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Context Data: ${args.contextData}\n\nUser Question: ${args.message}`,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text;
  },
});
