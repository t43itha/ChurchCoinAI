import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Fund, Transaction, FundType, AppUser } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend, Area } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Info, ArrowUpRight, Sparkles, Activity, Users, Target, ArrowRight, Banknote } from 'lucide-react';
import SmartSuggestionsPanel from './intelligence/SmartSuggestionsPanel';
import CashTakingsEntry from './CashTakingsEntry';
import { filterActiveTransactions } from '../lib/voidedTransactions';

interface Category {
  _id: string;
  name: string;
}

interface DashboardProps {
  funds: Fund[];
  transactions: Transaction[];
  categories: Category[];
  currentUser: AppUser;
}

const COLORS = ['#000000', '#d4a574', '#e5e5e5'];

const Dashboard: React.FC<DashboardProps> = ({ funds, transactions, categories, currentUser }) => {
  const [showCashTakingsModal, setShowCashTakingsModal] = useState(false);
  const canEdit = ['Admin', 'Finance Team'].includes(currentUser.role);
  const activeTransactions = useMemo(() => filterActiveTransactions(transactions), [transactions]);
  // --- Calculations ---

  // 1. Cash Flow Health (Previous Month - has complete data)
  const defaultDate = new Date();
  defaultDate.setMonth(defaultDate.getMonth() - 1);
  const currentMonthKey = defaultDate.toISOString().slice(0, 7); // Previous month
  const currentMonthTxns = activeTransactions.filter(t => t.date.startsWith(currentMonthKey));
  const incomeMonth = currentMonthTxns.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
  const expenseMonth = currentMonthTxns.filter(t => t.type === 'Expenditure').reduce((s, t) => s + t.amount, 0);
  const netCashFlow = incomeMonth - expenseMonth;

  // 2. Donor Momentum (Active Donors vs Previous Month)
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 2);
  const prevMonthKey = prevDate.toISOString().slice(0, 7);
  
  const getActiveDonorCount = (monthKey: string) => {
      const donors = new Set(
          activeTransactions
            .filter(t => t.date.startsWith(monthKey) && t.type === 'Income' && t.donorName)
            .map(t => t.donorName)
      );
      return donors.size;
  };
  const activeDonorsCurrent = getActiveDonorCount(currentMonthKey);
  const activeDonorsPrev = getActiveDonorCount(prevMonthKey);
  const donorGrowth = activeDonorsCurrent - activeDonorsPrev;

  // 3. Campaign Velocity (Primary Restricted Fund)
  const campaignFund = funds.find(f => f.type === FundType.RESTRICTED && f.targetAmount) || funds.find(f => f.type === FundType.RESTRICTED);
  const campaignProgress = campaignFund && campaignFund.targetAmount 
    ? Math.min((campaignFund.balance / campaignFund.targetAmount) * 100, 100)
    : 0;

  // 4. Chart Data (Last 6 Months)
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
       const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
       const monthKey = d.toISOString().slice(0, 7);
       const label = d.toLocaleString('default', { month: 'short' });
       
       const monthlyTxns = activeTransactions.filter(t => t.date.startsWith(monthKey));
       const inc = monthlyTxns.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
       const exp = monthlyTxns.filter(t => t.type === 'Expenditure').reduce((s, t) => s + t.amount, 0);
       
       data.push({ name: label, Income: inc, Expenditure: exp });
    }
    return data;
  }, [activeTransactions]);

  // 5. Priority Funds (Restricted or Low Balance)
  const priorityFunds = funds
    .filter(f => f.type === FundType.RESTRICTED || f.balance < 1000)
    .sort((a, b) => (a.targetAmount ? 0 : 1) - (b.targetAmount ? 0 : 1)) // Prioritize those with targets
    .slice(0, 5);

  return (
    <div className="space-y-8 animate-enter max-w-6xl mx-auto pb-12">
      <header className="flex items-end justify-between border-b border-ledger pb-6">
        <div>
            <h2 className="text-3xl font-bold text-ink tracking-tight">Overview</h2>
            <p className="text-grey-mid mt-1 text-sm font-medium">Finance & Donor Health Status</p>
        </div>
        <div className="flex gap-2">
             <span className="text-[10px] uppercase bg-grey-light px-2 py-1 rounded text-grey-mid font-bold tracking-wider">
                 {defaultDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
             </span>
        </div>
      </header>

      {/* Strategic KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cash Flow Health */}
        <div className="swiss-card p-6 bg-white flex flex-col justify-between h-40 group">
            <div className="flex justify-between items-start">
                <div className={`p-2 rounded-lg border ${netCashFlow >= 0 ? 'bg-sage-light border-sage text-sage' : 'bg-error-light border-error text-error'}`}>
                    <Activity size={20} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${netCashFlow >= 0 ? 'bg-sage-light text-sage-dark border-sage' : 'bg-error-light text-error border-error'}`}>
                    {netCashFlow >= 0 ? 'Positive' : 'Deficit'}
                </span>
            </div>
            <div>
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">Net Monthly Movement</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <h3 className={`text-2xl font-bold tracking-tighter ${netCashFlow >= 0 ? 'text-ink' : 'text-error'}`}>
                        {netCashFlow >= 0 ? '+' : ''}£{Math.abs(netCashFlow).toLocaleString()}
                    </h3>
                </div>
            </div>
        </div>

        {/* Donor Momentum */}
        <div className="swiss-card p-6 bg-white flex flex-col justify-between h-40 group">
            <div className="flex justify-between items-start">
                <div className="p-2 bg-sage-light rounded-lg border border-sage text-sage">
                    <Users size={20} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${donorGrowth >= 0 ? 'bg-sage-light text-sage-dark border-sage' : 'bg-grey-light text-grey-mid border-ledger'}`}>
                    {donorGrowth > 0 ? `+${donorGrowth} New` : donorGrowth === 0 ? 'Stable' : `${donorGrowth} Loss`}
                </span>
            </div>
            <div>
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">Active Donors</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-2xl font-bold text-ink tracking-tighter">{activeDonorsCurrent}</h3>
                    <span className="text-xs text-grey-mid font-medium">vs {activeDonorsPrev} last month</span>
                </div>
            </div>
        </div>

        {/* Campaign Velocity */}
        <div className="swiss-card p-6 bg-white flex flex-col justify-between h-40 group">
            <div className="flex justify-between items-start">
                <div className="p-2 bg-amber-light rounded-lg border border-amber text-amber">
                    <Target size={20} />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border bg-amber-light text-amber-dark border-amber">
                    Velocity
                </span>
            </div>
            <div>
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide truncate">{campaignFund?.name || 'No Active Campaign'}</p>
                {campaignFund ? (
                    <div className="mt-2">
                        <div className="flex justify-between text-xs font-bold text-ink mb-1">
                             <span>{campaignProgress.toFixed(1)}%</span>
                             <span className="text-grey-mid">of £{campaignFund.targetAmount?.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-grey-light rounded-full overflow-hidden">
                            <div className="h-full bg-amber rounded-full" style={{ width: `${campaignProgress}%` }}></div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm font-medium text-grey-mid mt-1">Start a restricted fund to track.</p>
                )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart: Income vs Expense Trend */}
        <div className="lg:col-span-2 swiss-card p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
                <h3 className="font-bold text-ink text-lg">Financial Trend</h3>
                <p className="text-xs text-grey-mid font-medium">6 Month Income vs Expenditure</p>
            </div>
            <div className="flex gap-4 text-xs font-bold uppercase tracking-wide">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-ink"></div> Income</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber"></div> Expense</div>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#666666'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#666666'}} />
                <Tooltip
                    cursor={{fill: '#fafaf9'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #000000', boxShadow: '4px 4px 0px rgba(0,0,0,1)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}
                />
                <Bar dataKey="Income" barSize={32} fill="#000000" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Expenditure" stroke="#d4a574" strokeWidth={3} dot={{r: 4, fill: '#d4a574', strokeWidth: 2, stroke: '#fff'}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Priority Fund List */}
        <div className="swiss-card overflow-hidden flex flex-col">
           <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper">
                <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Priority Funds</h3>
                <ArrowRight size={14} className="text-grey-mid" />
           </div>
           <div className="flex-1 overflow-y-auto">
               {priorityFunds.length === 0 ? (
                   <div className="p-8 text-center text-grey-mid text-sm">All funds healthy.</div>
               ) : (
                   <table className="w-full text-left">
                       <tbody>
                           {priorityFunds.map(f => (
                               <tr key={f._id} className="border-b border-ledger last:border-0 hover:bg-amber-light transition-colors">
                                   <td className="px-6 py-4">
                                       <div className="font-bold text-ink text-sm">{f.name}</div>
                                       <div className="text-[10px] text-grey-mid uppercase tracking-wide mt-0.5">{f.type}</div>
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                       <div className="font-bold text-ink text-sm">£{f.balance.toLocaleString()}</div>
                                       {f.targetAmount && (
                                           <div className="text-[10px] text-amber font-medium mt-0.5">
                                               {Math.round((f.balance / f.targetAmount)*100)}% of Goal
                                           </div>
                                       )}
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               )}
           </div>
        </div>
      </div>

      {/* Smart Suggestions Panel - Rules-based, zero AI cost */}
      <SmartSuggestionsPanel maxItems={5} />

      {/* Cash Takings Entry Modal */}
      {showCashTakingsModal && canEdit && (
        <CashTakingsEntry
          funds={funds}
          categories={categories}
          onClose={() => setShowCashTakingsModal(false)}
          onSuccess={(result) => {
            console.log(`Cash collection created: ${result.transactionCount} transactions`);
          }}
        />
      )}

      {/* Mobile Floating Action Button */}
      {canEdit && createPortal(
        <button
          onClick={() => setShowCashTakingsModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-sage text-white rounded-full shadow-lg flex items-center justify-center z-30 md:hidden hover:bg-sage-dark transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"
          aria-label="Record Cash Collection"
        >
          <Banknote size={24} />
        </button>,
        document.body
      )}
    </div>
  );
};

export default Dashboard;
