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
    
    // Only look at income that isn't linked to a pledge yet but might be relevant
    const candidates = transactions
        .filter(t => t.type === 'Income' && !t.isReconciled)
        .map(t => ({ id: t.id, desc: t.description, amount: t.amount, date: t.date }));
        
    const pledgeList = pledges.map(p => ({ id: p.id, donor: p.donorName, amount: p.amount }));

    const prompt = `
        I have a list of Transactions and a list of Pledges/Donors.
        Match the Transactions to the Pledges based on donor name similarity or amount patterns.
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

export const generateGiftAidSchedule = async (transactions: Transaction[]) => {
    if (!apiKey) throw new Error("API Key missing");

    const eligible = transactions
        .filter(t => t.isGiftAidEligible && t.type === 'Income')
        .map(t => ({ date: t.date, donor: t.donorName || 'Unknown', amount: t.amount }));

    if (eligible.length === 0) return "No Gift Aid eligible transactions found.";

    const prompt = `
        Create a Gift Aid Schedule summary for the HMRC (UK tax authority).
        List the total donation amount and the total Gift Aid Claimable (which is 25% of the donation amount).
        Group by Donor if possible.
        Format as a Markdown table.
        
        Data: ${JSON.stringify(eligible)}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
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