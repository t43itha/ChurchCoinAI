import React, { useState } from 'react';
import { Donor, Transaction, Pledge, Fund } from '../types';
import { generateDonorCommunication } from '../services/gemini';
import { Plus, User, Calendar, CreditCard, Mail, Sparkles, Search, ArrowUpRight, History } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DonorManagerProps {
  donors: Donor[];
  transactions: Transaction[];
  pledges: Pledge[];
  funds: Fund[];
  onAddDonor: (d: Donor) => void;
  onAddPledge: (p: Pledge) => void;
}

const DonorManager: React.FC<DonorManagerProps> = ({ donors, transactions, pledges, funds, onAddDonor, onAddPledge }) => {
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(donors[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingComm, setIsGeneratingComm] = useState(false);
  const [generatedComm, setGeneratedComm] = useState('');
  const [showAddPledgeModal, setShowAddPledgeModal] = useState(false);
  const [pledgeType, setPledgeType] = useState<'Tithe' | 'Project'>('Tithe');

  // Filter donors
  const filteredDonors = donors.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const selectedDonor = donors.find(d => d.id === selectedDonorId);

  // Derived Data
  const donorTransactions = transactions.filter(t => t.donorId === selectedDonorId || t.donorName === selectedDonor?.name);
  const lifetimeValue = donorTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
  const donorPledges = pledges.filter(p => p.donorId === selectedDonorId || p.donorName === selectedDonor?.name);

  // Chart Data
  const chartData = donorTransactions
    .filter(t => t.type === 'Income')
    .slice(0, 10)
    .map(t => ({
      date: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      amount: t.amount
    })).reverse();

  const handleGenerateCommunication = async () => {
    if (!selectedDonor) return;
    setIsGeneratingComm(true);
    setGeneratedComm('');
    try {
      const comm = await generateDonorCommunication(selectedDonor.name, donorTransactions, lifetimeValue);
      setGeneratedComm(comm || "Could not generate email.");
    } catch (e) {
      console.error(e);
      setGeneratedComm("Error generating communication.");
    } finally {
      setIsGeneratingComm(false);
    }
  };

  const handleCreateSchedule = (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      
      if (!selectedDonor) return;

      const newPledge: Pledge = {
          id: `p-${Date.now()}`,
          donorName: selectedDonor.name,
          donorId: selectedDonor.id,
          amount: parseFloat(formData.get('amount') as string),
          frequency: formData.get('frequency') as any,
          fundId: formData.get('fundId') as string,
          startDate: new Date().toISOString().split('T')[0],
          status: 'Active'
      };

      onAddPledge(newPledge);
      setShowAddPledgeModal(false);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-8rem)] gap-6 animate-fade-in">
      {/* List Sidebar */}
      <div className="w-full lg:w-1/3 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex justify-between items-center mb-4">
             <h2 className="font-bold text-slate-800 flex items-center gap-2"><User size={20}/> Donors</h2>
             <button onClick={() => alert("Add Donor feature implementation")} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                <Plus size={16} />
             </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search donors..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredDonors.map(donor => (
            <button
              key={donor.id}
              onClick={() => { setSelectedDonorId(donor.id); setGeneratedComm(''); }}
              className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedDonorId === donor.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}`}
            >
              <div className="font-medium text-slate-800">{donor.name}</div>
              <div className="text-xs text-slate-500">{donor.email || 'No email'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="w-full lg:w-2/3 flex flex-col gap-6 overflow-y-auto pr-2">
        {selectedDonor ? (
          <>
            {/* Header Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex justify-between items-start">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-xl font-bold">
                  {selectedDonor.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-slate-800">{selectedDonor.name}</h2>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <Mail size={14} /> {selectedDonor.email || 'No Email'}
                  </div>
                  <div className="mt-2 inline-flex gap-2">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full border border-slate-200">{selectedDonor.type}</span>
                    {lifetimeValue > 1000 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200">Top Donor</span>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Lifetime Giving</p>
                <p className="text-3xl font-bold text-emerald-600">£{lifetimeValue.toLocaleString()}</p>
              </div>
            </div>

            {/* Schedules / Pledges */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calendar size={18}/> Active Schedules</h3>
                  <div className="flex gap-2">
                      <button 
                        onClick={() => { setPledgeType('Tithe'); setShowAddPledgeModal(true); }}
                        className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100"
                      >
                        + Tithe Schedule
                      </button>
                      <button 
                        onClick={() => { setPledgeType('Project'); setShowAddPledgeModal(true); }}
                        className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100"
                      >
                        + Project Pledge
                      </button>
                  </div>
               </div>
               
               {donorPledges.length === 0 ? (
                 <p className="text-sm text-slate-400 italic">No active giving schedules.</p>
               ) : (
                 <div className="space-y-3">
                   {donorPledges.map(p => {
                     const fundName = funds.find(f => f.id === p.fundId)?.name;
                     return (
                       <div key={p.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:shadow-sm transition-shadow">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${p.fundId === 'f1' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                <CreditCard size={18} />
                            </div>
                            <div>
                                <div className="font-semibold text-slate-700">{fundName || 'Unknown Fund'}</div>
                                <div className="text-xs text-slate-500">{p.frequency} • Since {p.startDate}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-800">£{p.amount}</div>
                            <div className="text-xs text-emerald-600 font-medium">{p.status}</div>
                          </div>
                       </div>
                     );
                   })}
                 </div>
               )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recent History */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><History size={18}/> Recent History</h3>
                    <div className="space-y-3">
                        {donorTransactions.slice(0, 5).map(t => (
                            <div key={t.id} className="flex justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                                <span className="text-slate-500">{t.date}</span>
                                <span className="text-slate-700 truncate max-w-[150px]">{t.category}</span>
                                <span className="font-semibold text-emerald-600">+£{t.amount}</span>
                            </div>
                        ))}
                         {donorTransactions.length === 0 && <p className="text-sm text-slate-400">No recent transactions.</p>}
                    </div>
                </div>
                
                {/* Giving Trend */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ArrowUpRight size={18}/> Giving Trend</h3>
                    <div className="h-40">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false}/>
                                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px'}} />
                                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* AI Comm Generator */}
            <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-xl shadow-sm border border-indigo-100">
               <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2"><Sparkles size={18}/> AI Assistant</h3>
               <p className="text-sm text-indigo-700 mb-4">Generate a thank you email or letter based on recent giving.</p>
               
               {!generatedComm ? (
                 <button 
                    onClick={handleGenerateCommunication} 
                    disabled={isGeneratingComm}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                 >
                    {isGeneratingComm ? 'Drafting...' : 'Draft Thank You Note'}
                 </button>
               ) : (
                 <div className="animate-fade-in">
                    <textarea 
                        className="w-full h-40 p-3 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 bg-white"
                        value={generatedComm}
                        onChange={(e) => setGeneratedComm(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setGeneratedComm('')} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Discard</button>
                        <button onClick={() => alert("Copied to clipboard!")} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-xs font-medium">Copy to Clipboard</button>
                    </div>
                 </div>
               )}
            </div>

          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <User size={48} className="mb-4 text-slate-200" />
            <p>Select a donor to view details</p>
          </div>
        )}
      </div>

      {/* Add Pledge Modal */}
      {showAddPledgeModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                 <h3 className="text-xl font-bold text-slate-800 mb-4">
                     {pledgeType === 'Tithe' ? 'Create Tithe Schedule' : 'Create Fund Pledge'}
                 </h3>
                 <form onSubmit={handleCreateSchedule} className="space-y-4">
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Fund</label>
                         <select name="fundId" className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50" defaultValue={pledgeType === 'Tithe' ? funds.find(f => f.type === 'Unrestricted')?.id : funds.find(f => f.type === 'Restricted')?.id}>
                             {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                         </select>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                         <select name="frequency" className="w-full p-2 border border-slate-300 rounded-lg bg-white">
                             <option value="Monthly">Monthly</option>
                             <option value="Weekly">Weekly</option>
                             <option value="Annual">Annual</option>
                             <option value="One-off">One-off</option>
                         </select>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Amount (£)</label>
                         <input name="amount" type="number" step="0.01" className="w-full p-2 border border-slate-300 rounded-lg" required placeholder="0.00" />
                     </div>
                     <div className="flex justify-end gap-3 pt-4">
                         <button type="button" onClick={() => setShowAddPledgeModal(false)} className="text-slate-600 font-medium">Cancel</button>
                         <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium">Create Schedule</button>
                     </div>
                 </form>
             </div>
          </div>
      )}
    </div>
  );
};

export default DonorManager;