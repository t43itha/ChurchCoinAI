import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, Sparkles } from 'lucide-react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

interface AICoPilotProps {
    // Props kept for backwards compatibility but no longer used
    // AI context is now fetched via useQuery for comprehensive data
}

interface Message {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
}

const AICoPilot: React.FC<AICoPilotProps> = () => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            sender: 'ai',
            text: "Hello. I'm Steward, your AI finance assistant. I can see your complete financial history and answer questions like 'Which month was best for donations?' or 'Who are our top donors?'",
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatWithTreasurer = useAction(api.actions.ai.chatWithTreasurer);

    // Use pre-computed AI context with comprehensive summaries
    const aiContext = useQuery(api.queries.aiContext.getAIContext, {});

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: inputValue, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsThinking(true);

        try {
            // Use pre-computed comprehensive context instead of limited transactions
            const contextSummary = JSON.stringify({
                // Monthly summaries for aggregate questions
                monthlySummaries: aiContext?.monthlySummaries,
                // Top donors for "who are our best donors" questions
                topDonors: aiContext?.topDonors,
                // Fund balances with progress
                fundBalances: aiContext?.fundBalances,
                // Category breakdowns
                incomeByCategory: aiContext?.incomeByCategory,
                expenditureByCategory: aiContext?.expenditureByCategory,
                // Key totals
                totals: {
                    totalIncome: aiContext?.totalIncome,
                    totalExpenditure: aiContext?.totalExpenditure,
                    netBalance: aiContext?.netBalance,
                    ytdIncome: aiContext?.ytdIncome,
                    ytdExpenditure: aiContext?.ytdExpenditure,
                },
                // Pre-computed insights for common questions
                insights: {
                    bestMonth: aiContext?.bestMonth,
                    worstMonth: aiContext?.worstMonth,
                    dateRange: aiContext?.dateRange,
                },
                // Operational status
                metrics: {
                    transactionCount: aiContext?.transactionCount,
                    donorCount: aiContext?.donorCount,
                    uncategorizedCount: aiContext?.uncategorizedCount,
                },
                // Recent transactions for context
                recentTransactions: aiContext?.recentTransactions,
            });
            const responseText = await chatWithTreasurer({ message: userMsg.text, contextData: contextSummary });
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'ai', text: responseText || "I couldn't process that.", timestamp: new Date() }]);
        } catch (error) {
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'ai', text: "Connection error.", timestamp: new Date() }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] bg-white rounded-xl border border-ledger overflow-hidden max-w-5xl mx-auto animate-enter shadow-soft-sm">
            <header className="p-5 border-b border-ledger flex items-center gap-3 bg-[#fcfbf9]">
                <div className="w-10 h-10 bg-ink rounded-lg flex items-center justify-center text-white">
                    <Bot size={18} />
                </div>
                <div>
                    <h2 className="font-bold text-ink text-lg">Ask Ward</h2>
                    <p className="text-[10.5px] text-grey-mid font-mono uppercase tracking-[0.1em]">Gemini 2.5 Flash Connected</p>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-paper">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                            msg.sender === 'user' 
                                ? 'bg-ink text-white rounded-br-none shadow-[0_8px_18px_-10px_rgba(28,25,23,.65)]' 
                                : 'bg-white text-grey-dark border border-ledger rounded-bl-none'
                        }`}>
                            {msg.sender === 'ai' && <Sparkles size={12} className="text-sage mb-2" />}
                            <p>{msg.text}</p>
                        </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex justify-start">
                         <div className="bg-white border border-ledger rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-grey-mid" />
                            <span className="text-xs text-grey-mid font-medium">Analyzing Ledger...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-ledger">
                <div className="flex gap-3">
                    <input 
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about your finances..."
                        className="flex-1 bg-paper border border-ledger rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ink/10 focus:border-ink transition-all"
                    />
                    <button onClick={handleSend} disabled={!inputValue.trim() || isThinking} className="btn-primary px-4 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AICoPilot;
