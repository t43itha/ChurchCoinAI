import React, { useEffect, useState } from 'react';
import { Fund, Transaction, Insight } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { generateInsights } from '../services/gemini';

interface DashboardProps {
  funds: Fund[];
  transactions: Transaction[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

const Dashboard: React.FC<DashboardProps> = ({ funds, transactions }) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchInsights = async () => {
        if (transactions.length > 0) {
            setLoadingInsights(true);
            const generated = await generateInsights(transactions);
            if (isMounted) {
                setInsights(generated.map((g: any, i: number) => ({ ...g, id: `ai-${i}`, date: new Date().toISOString() })));
                setLoadingInsights(false);
            }
        }
    };
    fetchInsights();
    return () => { isMounted = false; };
  }, [transactions]); // Only regenerate if transactions change meaningfully, typically handled by parent logic

  const totalBalance = funds.reduce((acc, f) => acc + f.balance, 0);
  const totalIncome = transactions
    .filter(t => t.type === 'Income')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpenditure = transactions
    .filter(t => t.type === 'Expenditure')
    .reduce((acc, t) => acc + t.amount, 0);

  const fundData = funds.map(f => ({ name: f.name, value: f.balance }));

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-slate-800">Financial Overview</h2>
        <p className="text-slate-500">Welcome back. Here is your current financial standing.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-12 -mt-12 opacity-50"></div>
          <p className="text-sm font-medium text-slate-500 mb-1">Total Funds Balance</p>
          <h3 className="text-3xl font-bold text-slate-800">£{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          <div className="mt-4 flex items-center text-sm text-emerald-600">
            <CheckCircle2 size={16} className="mr-1" /> Healthy Reserves
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-1">Income (YTD)</p>
          <h3 className="text-3xl font-bold text-emerald-600">£{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          <div className="mt-4 flex items-center text-sm text-slate-400">
            <TrendingUp size={16} className="mr-1" /> Donations & Grants
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-1">Expenditure (YTD)</p>
          <h3 className="text-3xl font-bold text-rose-500">£{totalExpenditure.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          <div className="mt-4 flex items-center text-sm text-slate-400">
            <TrendingDown size={16} className="mr-1" /> Utilities & Ministry
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-6 font-serif">Fund Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fundData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {fundData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="bg-gradient-to-b from-indigo-50 to-white p-6 rounded-xl shadow-sm border border-indigo-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-indigo-900 font-serif flex items-center gap-2">
              <span className="text-xl">✨</span> AI Insights
            </h3>
            {loadingInsights && <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent"></div>}
          </div>
          
          <div className="space-y-4">
            {insights.length === 0 && !loadingInsights && (
               <p className="text-sm text-slate-500 italic">Add transactions to generate AI insights.</p>
            )}
            
            {insights.map((insight) => (
              <div key={insight.id} className="bg-white p-4 rounded-lg shadow-sm border border-indigo-50">
                <div className="flex items-start gap-3">
                  {insight.type === 'warning' && <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />}
                  {insight.type === 'success' && <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />}
                  {insight.type === 'info' && <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">{insight.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{insight.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;