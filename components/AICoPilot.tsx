import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, Sparkles } from 'lucide-react';
import { Transaction, Fund } from '../types';
import { useAction } from 'convex/react';
import { api } from '../convex/_generated/api';

interface AICoPilotProps {
    transactions: Transaction[];
    funds: Fund[];
}

interface Message {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
}

const AICoPilot: React.FC<AICoPilotProps> = ({ transactions, funds }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            sender: 'ai',
            text: "Hello. I'm Steward, your AI finance assistant. How can I help with the ledger today?",
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatWithTreasurer = useAction(api.actions.ai.chatWithTreasurer);

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
            const contextSummary = JSON.stringify({
                funds: funds.map(f => ({ name: f.name, balance: f.balance, type: f.type })),
                recentTransactions: transactions.slice(0, 20).map(t => ({ date: t.date, desc: t.description, amount: t.amount, type: t.type, category: t.category }))
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
        <div className="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden max-w-4xl mx-auto animate-enter">
            <header className="p-4 border-b border-slate-100 flex items-center gap-3 bg-white">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                    <Bot size={18} />
                </div>
                <div>
                    <h2 className="font-bold text-slate-900 text-sm">Steward Assistant</h2>
                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">Gemini 2.5 Flash Connected</p>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                            msg.sender === 'user' 
                                ? 'bg-indigo-600 text-white rounded-br-none' 
                                : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'
                        }`}>
                            {msg.sender === 'ai' && <Sparkles size={12} className="text-indigo-500 mb-2" />}
                            <p>{msg.text}</p>
                        </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex justify-start">
                         <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-slate-400" />
                            <span className="text-xs text-slate-500 font-medium">Analyzing Ledger...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-100">
                <div className="flex gap-3">
                    <input 
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about your finances..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all"
                    />
                    <button onClick={handleSend} disabled={!inputValue.trim() || isThinking} className="bg-slate-900 text-white rounded-md px-4 hover:bg-slate-800 disabled:opacity-50 transition-colors">
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AICoPilot;
