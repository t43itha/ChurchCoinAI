import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, Fund, Pledge } from "../types";

const apiKey = process.env.API_KEY || '';

// Helper to check if API key exists without exposing it directly
export const hasApiKey = (): boolean => !!apiKey;

const ai = new GoogleGenAI({ apiKey });

export const categorizeTransactions = async (
  rawDescriptions: string[],
  availableFunds: Fund[],
  categories: string[]
): Promise<Array<{ description: string; category: string; fundName: string; confidence: string; isGiftAidEligible: boolean; donorName?: string }>> => {
  if (!apiKey) throw new Error("API Key missing");

  const prompt = `
    You are an expert UK Charity Treasurer assistant.
    I have a list of bank transaction descriptions.
    For each description:
    1. Suggest the most appropriate Category and Fund Name.
    2. Determine if it is likely Gift Aid Eligible (Individual donations usually are, business/cash/grants usually aren't).
    3. Extract a Donor Name if present (e.g., "Ref: J SMITH" -> "J Smith").

    Available Categories: ${categories.join(', ')}
    Available Funds: ${availableFunds.map(f => f.name).join(', ')}

    Rules:
    - "Tithe" or "Donation" from a person is usually Gift Aid eligible.
    - Utility bills go to General Fund / Utilities.
    - Specific project references (e.g. 'Roof', 'Building') go to that Fund.

    Input Descriptions:
    ${JSON.stringify(rawDescriptions)}
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
              donorName: { type: Type.STRING }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Categorization Error:", error);
    return [];
  }
};

export const generateTreasurerReport = async (transactions: Transaction[], funds: Fund[]) => {
  if (!apiKey) throw new Error("API Key missing");

  const summary = {
    totalIncome: transactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0),
    totalExpenditure: transactions.filter(t => t.type === 'Expenditure').reduce((acc, t) => acc + t.amount, 0),
    fundsStatus: funds.map(f => ({ name: f.name, balance: f.balance })),
    recentLargeTransactions: transactions.filter(t => t.amount > 500).map(t => ({ desc: t.description, amount: t.amount }))
  };

  const prompt = `
    Write a brief, professional Treasurer's Report for the Board of Trustees (approx 200 words).
    Use a reassuring but factual tone suitable for a UK Charity.
    Highlight the current financial health, any major expenses, and the status of restricted funds.
    Use this data: ${JSON.stringify(summary)}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
  });

  return response.text;
};

export const chatWithTreasurer = async (message: string, contextData: string) => {
  if (!apiKey) throw new Error("API Key missing");

  const systemInstruction = `
    You are "Steward", an AI assistant for a Church Treasurer.
    You are helpful, polite, and knowledgeable about UK charity accounting.
    You have access to the current financial data provided in the context.
    Answer questions based on this data. If you don't know, say so.
    Keep answers concise.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Context Data: ${contextData}\n\nUser Question: ${message}`,
    config: {
      systemInstruction: systemInstruction
    }
  });

  return response.text;
};

export const generateInsights = async (transactions: Transaction[]) => {
    if (!apiKey) return [];

    const prompt = `
      Analyze these transactions and provide 3 brief financial insights or alerts for the treasurer.
      Focus on anomalies, subscription creep, or good news (e.g. increased giving).
      Return JSON array of objects with 'title', 'description', 'type' (warning, info, success).
      Transactions: ${JSON.stringify(transactions.slice(0, 50))}
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
                            type: { type: Type.STRING, enum: ["warning", "info", "success"] }
                        }
                    }
                }
            }
        });
        const text = response.text;
        return text ? JSON.parse(text) : [];
    } catch (e) {
        console.error("Insight generation failed", e);
        return [];
    }
};

export const reconcilePledges = async (transactions: Transaction[], pledges: Pledge[]) => {
    if (!apiKey) throw new Error("API Key missing");
    
    // Only look at income that isn't linked to a pledge yet
    const candidates = transactions
        .filter(t => t.type === 'Income' && !t.pledgeId)
        .map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date }));
        
    const pledgeList = pledges.map(p => ({ id: p.id, donor: p.donorName, amount: p.amount }));

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
                            reason: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        const text = response.text;
        return text ? JSON.parse(text) : [];
    } catch (e) {
        console.error("Reconciliation failed", e);
        return [];
    }
};

export const generateGiftAidSchedule = async (transactions: Transaction[], startDate?: string, endDate?: string) => {
    if (!apiKey) throw new Error("API Key missing");

    // Filter relevant transactions
    let eligible = transactions.filter(t => t.isGiftAidEligible && t.type === 'Income');
    if (startDate) eligible = eligible.filter(t => t.date >= startDate);
    if (endDate) eligible = eligible.filter(t => t.date <= endDate);

    if (eligible.length === 0) return "No Gift Aid eligible transactions found for this period.";

    // Aggregate by Donor in TypeScript for accuracy
    const donorTotals: Record<string, number> = {};
    let totalClaimable = 0;

    eligible.forEach(t => {
        const name = t.donorName || 'Unknown Donor';
        donorTotals[name] = (donorTotals[name] || 0) + t.amount;
    });

    const breakdown = Object.entries(donorTotals).map(([donor, amount]) => {
        const claim = amount * 0.25;
        totalClaimable += claim;
        return { donor, totalDonation: amount, claimable: claim };
    });

    const prompt = `
        Create a formal Gift Aid Schedule summary for HMRC (UK tax authority).
        
        Period: ${startDate || 'All Time'} to ${endDate || 'Present'}
        
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
        contents: prompt
    });

    return response.text;
};

export const generateProjectReport = async (transactions: Transaction[], fund: Fund, startDate?: string, endDate?: string) => {
    if (!apiKey) throw new Error("API Key missing");

    let fundTxns = transactions.filter(t => t.fundId === fund.id);
    if (startDate) fundTxns = fundTxns.filter(t => t.date >= startDate);
    if (endDate) fundTxns = fundTxns.filter(t => t.date <= endDate);

    const income = fundTxns.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const expense = fundTxns.filter(t => t.type === 'Expenditure').reduce((acc, t) => acc + t.amount, 0);

    const prompt = `
        Write a "Project Impact Update" for the '${fund.name}' fund.
        Target Audience: Church members or newsletter subscribers.
        
        Financials:
        - Opening Balance: (Context: Fund Balance is currently £${fund.balance})
        - Period Income: £${income}
        - Period Spend: £${expense}
        - Target: £${fund.targetAmount || 'N/A'}
        
        Key Activity (Transactions):
        ${JSON.stringify(fundTxns.slice(0, 10).map(t => ({ date: t.date, desc: t.description, amount: t.amount, type: t.type })))}

        Instructions:
        1. Write an engaging title.
        2. Summarize progress towards the target (if applicable).
        3. Highlight key expenditures (what the money achieved).
        4. Thank donors for specific support.
        5. Format using Markdown.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text;
};

export const generateCampaignReport = async (transactions: Transaction[], fund: Fund, pledges: Pledge[]) => {
    if (!apiKey) throw new Error("API Key missing");

    const campaignTxns = transactions.filter(t => t.fundId === fund.id && t.type === 'Income');
    const campaignPledges = pledges.filter(p => p.fundId === fund.id);

    const totalRaisedCash = campaignTxns.reduce((sum, t) => sum + t.amount, 0);
    const totalPledged = campaignPledges.reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate unique donors
    const donorSet = new Set<string>();
    campaignTxns.forEach(t => { if (t.donorName) donorSet.add(t.donorName) });
    campaignPledges.forEach(p => { if (p.donorName) donorSet.add(p.donorName) });
    const donorCount = donorSet.size || campaignTxns.length; // Fallback if no names

    const avgDonation = campaignTxns.length > 0 ? totalRaisedCash / campaignTxns.length : 0;

    const stats = {
        fundName: fund.name,
        target: fund.targetAmount || 'Not Set',
        totalRaisedCash,
        totalPledged,
        donorCount,
        avgDonation: avgDonation.toFixed(2),
        deadline: fund.deadline || 'None'
    };

    const prompt = `
        Write a Strategic Campaign Fundraising Report for the '${fund.name}'.
        
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
        model: "gemini-3-pro-preview",
        contents: prompt
    });

    return response.text;
};

export const generateDonorCommunication = async (donorName: string, transactions: any[], totalGiven: number) => {
    if (!apiKey) throw new Error("API Key missing");

    const prompt = `
        Write a polite, warm "Thank You" email to a donor named ${donorName}.
        They have given a total of £${totalGiven}.
        Recent donations: ${JSON.stringify(transactions.slice(0, 3))}
        
        Tone: Grateful, professional, Christian charity context.
        Mention specifically how their support helps the church/charity.
        Do not include placeholders like [Date] - just use today's context or keep it general.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });
    return response.text;
};