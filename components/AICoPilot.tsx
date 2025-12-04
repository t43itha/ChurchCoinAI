import React, { useState, useRef, useEffect } from 'react';
import { MessageSquareText, Send, Bot, User, Loader2 } from 'lucide-react';
import { Transaction, Fund } from '../types';
import { chatWithTreasurer } from '../services/gemini';

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
            text: "Hello! I'm Steward, your AI finance assistant. Ask me about your funds, recent spending, or for help with categorization.",
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            text: inputValue,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsThinking(true);

        try {
            // Prepare lightweight context
            const contextSummary = JSON.stringify({
                funds: funds.map(f => ({ name: f.name, balance: f.balance, type: f.type })),
                recentTransactions: transactions.slice(0, 20).map(t => ({ 
                    date: t.date, 
                    desc: t.description, 
                    amount: t.amount, 
                    type: t.type,
                    category: t.category 
                }))
            });

            const responseText = await chatWithTreasurer(userMsg.text, contextSummary);

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'ai',
                text: responseText || "I'm sorry, I couldn't process that request right now.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (error) {
            console.error(error);
             const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'ai',
                text: "I encountered an error connecting to the AI service. Please check your API key.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <header className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                    <Bot size={24} />
                </div>
                <div>
                    <h2 className="font-bold text-slate-800">Steward Assistant</h2>
                    <p className="text-xs text-slate-500">Powered by Gemini 2.5 Flash</p>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {messages.map((msg) => (
                    <div 
                        key={msg.id} 
                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`
                            max-w-[80%] rounded-2xl p-4 shadow-sm
                            ${msg.sender === 'user' 
                                ? 'bg-emerald-600 text-white rounded-br-none' 
                                : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
                            }
                        `}>
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                            <span className={`text-[10px] block mt-2 opacity-70 ${msg.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'}`}>
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex justify-start">
                         <div className="bg-white text-slate-500 border border-slate-100 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-xs">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-100">
                <div className="flex gap-2 relative">
                    <input 
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about funds, expenses, or accounting rules..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isThinking}
                        className="bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </div>
                <p className="text-center text-[10px] text-slate-400 mt-2">
                    AI can make mistakes. Please verify important financial advice.
                </p>
            </div>
        </div>
    );
};

export default AICoPilot;