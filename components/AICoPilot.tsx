import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, RotateCcw, MessageSquare } from 'lucide-react';
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

const welcomeMessage: Message = {
    id: 'welcome',
    sender: 'ai',
    text: "Hello, I'm Ward — your AI finance assistant. I can see your complete ledger: every gift, fund, and pledge. Ask me anything, like which month was best for giving or who your top donors are.",
    timestamp: new Date()
};

const starterPrompts = [
    'Who are our top donors?',
    'Which month was best for giving?',
    'How is the Building Fund appeal doing?',
    'What Gift Aid can we claim?',
    'Summarise May 2026',
    'Which donors need follow-up?'
];

const AICoPilot: React.FC<AICoPilotProps> = () => {
    const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
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

    const resetChat = () => {
        setMessages([{ ...welcomeMessage, timestamp: new Date() }]);
        setInputValue('');
        setIsThinking(false);
    };

    const handleSend = async (messageOverride?: string) => {
        const messageText = (messageOverride ?? inputValue).trim();
        if (!messageText || isThinking) return;

        const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: messageText, timestamp: new Date() };
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

    const showStarterPrompts = messages.length === 1 && messages[0].id === 'welcome' && !isThinking;

    return (
        <div className="space-y-[22px] max-w-7xl mx-auto pb-10 animate-enter">
            <header className="swiss-card-static p-6 md:p-[26px] flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-ink rounded-xl flex items-center justify-center text-white shadow-soft-sm shrink-0">
                        <Sparkles size={19} />
                    </div>
                    <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-grey-mid mb-2">Gemini 2.5 Flash Connected</p>
                        <h2 className="font-heading text-[32px] md:text-[40px] leading-none text-ink tracking-normal">Ask Ward</h2>
                        <p className="mt-3 text-[15px] text-grey-mid max-w-2xl">Your AI finance copilot — grounded in the full ledger.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={resetChat}
                    className="btn-secondary h-11 px-4 inline-flex items-center justify-center gap-2 self-start md:self-auto"
                >
                    <RotateCcw size={16} />
                    <span>New chat</span>
                </button>
            </header>

            <section className="swiss-card bg-white overflow-hidden flex flex-col min-h-[540px] h-[calc(100vh-13rem)]">
                <div className="flex-1 overflow-y-auto bg-[#fcfbf9] p-5 md:p-6 space-y-5">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.sender === 'ai' && (
                                <div className="w-9 h-9 bg-ink rounded-xl flex items-center justify-center text-white shadow-soft-sm shrink-0 mt-1">
                                    <Sparkles size={15} />
                                </div>
                            )}
                            <div className={`max-w-[86%] md:max-w-[74%] p-4 md:p-[18px] text-sm md:text-[15px] leading-relaxed ${
                                msg.sender === 'user'
                                    ? 'bg-ink text-white rounded-2xl rounded-br-md'
                                    : 'bg-white text-grey-dark border border-ledger rounded-2xl rounded-tl-md'
                            }`}>
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </div>
                    ))}

                    {showStarterPrompts && (
                        <div className="md:ml-12 max-w-3xl">
                            <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-grey-mid mb-3">Try asking</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {starterPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onClick={() => handleSend(prompt)}
                                        className="group min-h-[54px] text-left bg-white border border-ledger rounded-xl px-4 py-3 text-[13px] font-semibold text-grey-dark hover:border-amber hover:bg-[#fffdf9] transition-colors flex items-center gap-3"
                                    >
                                        <MessageSquare size={15} className="text-grey-mid group-hover:text-amber shrink-0" />
                                        <span>{prompt}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {isThinking && (
                        <div className="flex justify-start gap-3">
                            <div className="w-9 h-9 bg-ink rounded-xl flex items-center justify-center text-white shadow-soft-sm shrink-0 mt-1">
                                <Loader2 size={15} className="animate-spin" />
                            </div>
                            <div className="bg-white border border-ledger rounded-2xl rounded-tl-md p-4 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                                <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse [animation-delay:120ms]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse [animation-delay:240ms]" />
                                <span className="ml-2 text-xs text-grey-mid font-medium">Analysing your ledger…</span>
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
                            placeholder="Ask Ward about your finances…"
                            className="flex-1 h-12 bg-paper border border-ledger rounded-xl px-4 text-sm focus:outline-none focus:ring-[3px] focus:ring-ink/10 focus:border-ink transition-all"
                        />
                        <button
                            type="button"
                            aria-label="Send message"
                            onClick={() => handleSend()}
                            disabled={!inputValue.trim() || isThinking}
                            className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-sage text-white transition-colors enabled:hover:opacity-90 disabled:bg-[#dcd9d3] disabled:cursor-default"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    <p className="mt-3 text-[11px] text-grey-mid text-center">Ward references your live financial data. Always review figures before filing or sharing.</p>
                </div>
            </section>
        </div>
    );
};

export default AICoPilot;
