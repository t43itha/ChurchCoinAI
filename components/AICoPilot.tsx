import { useState, useRef, useEffect, type FC } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useGiftAidEnabled } from './app/useGiftAidEnabled';
import HubHeader from './hub/HubHeader';
import { btnMd, btnOutline, chip, eyebrow, txtInput } from './wizard/ui';

interface Message {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
}

export type AnswerBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

const BULLET = /^([-*•]|\d+[.)])\s+/;

// Ward answers as plain text. A blank line ends a block, a run of "- " or "1. " lines becomes a list,
// and other consecutive lines join into one paragraph.
export function answerBlocks(text: string): AnswerBlock[] {
    const blocks: AnswerBlock[] = [];
    let paragraph: string[] = [];
    let items: string[] = [];
    const flush = () => {
        if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
        if (items.length > 0) blocks.push({ kind: 'list', items });
        paragraph = [];
        items = [];
    };
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) {
            flush();
        } else if (BULLET.test(line)) {
            if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
            paragraph = [];
            items.push(line.replace(BULLET, ''));
        } else {
            if (items.length > 0) blocks.push({ kind: 'list', items });
            items = [];
            paragraph.push(line);
        }
    }
    flush();
    return blocks;
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
    'Summarise May 2026',
    'Which donors need follow-up?'
];

const AICoPilot: FC = () => {
    const giftAidEnabled = useGiftAidEnabled();
    const visibleStarterPrompts = giftAidEnabled
        ? [...starterPrompts.slice(0, 3), 'What Gift Aid can we claim?', ...starterPrompts.slice(3)]
        : starterPrompts;
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
        } catch {
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'ai', text: "Connection error.", timestamp: new Date() }]);
        } finally {
            setIsThinking(false);
        }
    };

    const showStarterPrompts = messages.length === 1 && messages[0].id === 'welcome' && !isThinking;

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-4">
            <HubHeader
                title="Ask Ward"
                status="Questions about your church's money, answered from your books."
                actions={
                    <button type="button" onClick={resetChat} className={`${btnOutline} ${btnMd} !w-auto px-4`}>
                        <RotateCcw size={15} aria-hidden="true" />
                        New chat
                    </button>
                }
            />

            <section className="flex h-[calc(100dvh-16rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-ledger bg-white">
                <div className="flex-1 space-y-3 overflow-y-auto bg-paper p-4" aria-live="polite">
                    {messages.map((msg) => (
                        msg.sender === 'user' ? (
                            <div key={msg.id} className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[15px] leading-relaxed text-white">
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        ) : (
                            <div key={msg.id} className="mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-ledger bg-white px-4 py-3 text-[15px] leading-relaxed text-ink">
                                <p className={eyebrow}>Ward</p>
                                <div className="mt-1.5 space-y-2">
                                    {answerBlocks(msg.text).map((block, index) =>
                                        block.kind === 'list' ? (
                                            <ul key={index} className="list-disc space-y-1 pl-5">
                                                {block.items.map((item, itemIndex) => (
                                                    <li key={itemIndex}>{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p key={index}>{block.text}</p>
                                        )
                                    )}
                                </div>
                            </div>
                        )
                    ))}

                    {isThinking && (
                        <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-tl-md border border-ledger bg-white px-4 py-3">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber [animation-delay:120ms]" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber [animation-delay:240ms]" />
                            <span className="ml-2 text-xs font-medium text-grey-mid">Checking the books…</span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-ledger bg-white p-3">
                    {showStarterPrompts && (
                        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Suggested questions">
                            {visibleStarterPrompts.map((prompt) => (
                                <button key={prompt} type="button" onClick={() => handleSend(prompt)} className={`${chip} shrink-0`}>
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}
                    <form
                        className="flex gap-2.5"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleSend();
                        }}
                    >
                        <label htmlFor="ward-question" className="sr-only">
                            Ask Ward a question
                        </label>
                        <input
                            id="ward-question"
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask about your money…"
                            className={`${txtInput} h-12`}
                        />
                        <button
                            type="submit"
                            aria-label="Send message"
                            disabled={!inputValue.trim() || isThinking}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-ink text-white transition-colors hover:bg-charcoal disabled:opacity-35"
                        >
                            <Send size={18} aria-hidden="true" />
                        </button>
                    </form>
                    <p className="mt-2.5 text-center text-[11px] text-grey-mid">
                        Ward reads your live books. Check figures before you file or share them.
                    </p>
                </div>
            </section>
        </div>
    );
};

export default AICoPilot;
