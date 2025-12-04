import React, { useState } from 'react';
import { Donor, Transaction, Pledge, Fund, TransactionType } from '../types';
import { generateDonorCommunication } from '../services/gemini';
import { Plus, User, Calendar, Mail, Phone, MapPin, Gift, Sparkles, Search, History, Wallet, Edit2, X, Save, Link as LinkIcon, Unlink, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DonorManagerProps {
  donors: Donor[];
  transactions: Transaction[];
  pledges: Pledge[];
  funds: Fund[];
  onAddDonor: (d: Donor) => void;
  onUpdateDonor: (d: Donor) => void;
  onAddPledge: (p: Pledge) => void;
  onUpdateTransaction: (t: Transaction) => void;
}

const DonorManager: React.FC<DonorManagerProps> = ({ donors, transactions, pledges, funds, onUpdateDonor, onAddPledge, onUpdateTransaction }) => {
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(donors[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [generatedComm, setGeneratedComm] = useState('');
  const [showAddPledgeModal, setShowAddPledgeModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Donor>>({});
  
  // State for new pledge form
  const [newPledgeData, setNewPledgeData] = useState<Partial<Pledge>>({
    frequency: 'Monthly',
    status: 'Active',
    startDate: new Date().toISOString().split('T')[0]
  });

  const filteredDonors = donors.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const selectedDonor = donors.find(d => d.id === selectedDonorId);
  const donorTransactions = transactions.filter(t => t.donorId === selectedDonorId || t.donorName === selectedDonor?.name)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
  const lifetimeValue = donorTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
  const donorPledges = pledges.filter(p => p.donorId === selectedDonorId || p.donorName === selectedDonor?.name);
  const activePledges = donorPledges.filter(p => p.status === 'Active');

  const chartData = donorTransactions.filter(t => t.type === 'Income').slice(0, 10).map(t => ({
      date: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      amount: t.amount
  })).reverse();

  const handleGenerateCommunication = async () => {
    if (!selectedDonor) return;
    try {
      setGeneratedComm("Drafting...");
      const comm = await generateDonorCommunication(selectedDonor.name, donorTransactions, lifetimeValue);
      setGeneratedComm(comm || "Error.");
    } catch (e) { console.error(e); }
  };

  const handleEditClick = () => {
      if (selectedDonor) {
          setFormData(selectedDonor);
          setIsEditing(true);
      }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedDonor && formData.name) {
          onUpdateDonor({ ...selectedDonor, ...formData } as Donor);
          setIsEditing(false);
      }
  };

  const handleAddPledgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDonor && newPledgeData.amount && newPledgeData.fundId) {
        const pledge: Pledge = {
            id: Math.random().toString(36).substr(2, 9),
            donorId: selectedDonor.id,
            donorName: selectedDonor.name,
            amount: Number(newPledgeData.amount),
            fundId: newPledgeData.fundId,
            frequency: newPledgeData.frequency as any,
            startDate: newPledgeData.startDate || new Date().toISOString().split('T')[0],
            endDate: newPledgeData.endDate,
            status: 'Active'
        };
        onAddPledge(pledge);
        setShowAddPledgeModal(false);
        setNewPledgeData({ 
            frequency: 'Monthly', 
            status: 'Active', 
            startDate: new Date().toISOString().split('T')[0] 
        });
    }
  };

  const handleLinkTransaction = (transaction: Transaction, pledgeId: string) => {
      if (!pledgeId) return;
      onUpdateTransaction({ ...transaction, pledgeId });
  };

  const handleUnlinkTransaction = (transaction: Transaction) => {
      onUpdateTransaction({ ...transaction, pledgeId: undefined });
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-8rem)] gap-6 animate-enter max-w-7xl mx-auto">
      <div className="w-full lg:w-80 swiss-card flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" placeholder="Search donors..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredDonors.map(donor => (
            <button
              key={donor.id}
              onClick={() => { setSelectedDonorId(donor.id); setGeneratedComm(''); }}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedDonorId === donor.id ? 'bg-slate-50 border-l-2 border-l-slate-900' : ''}`}
            >
              <div className="text-sm font-bold text-slate-800">{donor.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{donor.type}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
        {selectedDonor ? (
          <>
            <div className="swiss-card p-6 flex justify-between items-start relative group">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {selectedDonor.name.charAt(0)}
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-slate-900 font-display">{selectedDonor.name}</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 pt-1">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Mail size={14} className="text-slate-400"/> <span>{selectedDonor.email || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Phone size={14} className="text-slate-400"/> <span>{selectedDonor.phone || '-'}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-slate-500 md:col-span-2">
                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0"/> <span className="max-w-xs">{selectedDonor.address || '-'}</span>
                      </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                     {selectedDonor.isGiftAidActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Gift size={10} /> Gift Aid Active
                        </span>
                     )}
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 border border-slate-200">
                        {selectedDonor.type}
                     </span>
                  </div>

                  {selectedDonor.notes && <p className="text-xs text-slate-400 mt-2 max-w-md italic border-l-2 border-slate-200 pl-2">{selectedDonor.notes}</p>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">LTV</p>
                    <p className="text-3xl font-bold text-slate-900 font-mono tracking-tighter">£{lifetimeValue.toLocaleString()}</p>
                </div>
                <button onClick={handleEditClick} className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-indigo-600 hover:text-indigo-800 mt-2">
                    <Edit2 size={12} /> Edit Profile
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Schedules */}
                <div className="swiss-card p-6">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2"><Calendar size={16}/> Active Schedules</h3>
                      <button onClick={() => setShowAddPledgeModal(true)} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md font-bold uppercase tracking-wide hover:bg-slate-800">
                        + New
                      </button>
                   </div>
                   
                   {donorPledges.length === 0 ? <p className="text-sm text-slate-400 italic">No active giving schedules.</p> : (
                     <div className="space-y-3">
                       {donorPledges.map(p => (
                           <div key={p.id} className="flex justify-between items-center p-3 border border-slate-100 rounded bg-slate-50/50">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-white border border-slate-200 rounded text-slate-600"><Wallet size={16} /></div>
                                <div>
                                    <div className="font-bold text-slate-800 text-sm">{funds.find(f => f.id === p.fundId)?.name}</div>
                                    <div className="text-xs text-slate-500 font-medium">{p.frequency}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-slate-900 font-mono">£{p.amount}</div>
                                <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">{p.status}</div>
                              </div>
                           </div>
                       ))}
                     </div>
                   )}
                </div>

                {/* Trend Chart */}
                 <div className="swiss-card p-6">
                    <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide">Trend</h3>
                    <div className="h-40">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <XAxis dataKey="date" tick={{fontSize: 9}} tickLine={false} axisLine={false}/>
                                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '4px', fontSize: '12px'}} />
                                <Bar dataKey="amount" fill="#111827" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* Transaction Ledger & Linking */}
            <div className="swiss-card p-6">
                <h3 className="font-bold text-slate-900 mb-6 text-sm uppercase tracking-wide flex items-center gap-2">
                    <FileText size={16} /> Transaction History & Matching
                </h3>
                
                {donorTransactions.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No transactions found for this donor.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left ledger-table">
                            <thead>
                                <tr>
                                    <th className="pb-3 text-xs">Date</th>
                                    <th className="pb-3 text-xs">Description</th>
                                    <th className="pb-3 text-xs text-right">Amount</th>
                                    <th className="pb-3 text-xs">Pledge Match</th>
                                </tr>
                            </thead>
                            <tbody>
                                {donorTransactions.map(t => {
                                    const linkedPledge = pledges.find(p => p.id === t.pledgeId);
                                    
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="py-3 text-slate-500 font-mono text-xs border-b border-slate-50">{t.date}</td>
                                            <td className="py-3 font-medium text-slate-800 text-sm border-b border-slate-50">{t.description}</td>
                                            <td className={`py-3 font-mono text-sm font-bold text-right border-b border-slate-50 ${t.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                {t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}
                                            </td>
                                            <td className="py-3 pl-4 border-b border-slate-50">
                                                {t.type === TransactionType.INCOME ? (
                                                    linkedPledge ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 border border-indigo-100">
                                                                <LinkIcon size={10} />
                                                                {funds.find(f => f.id === linkedPledge.fundId)?.name}
                                                            </div>
                                                            <button 
                                                                onClick={() => handleUnlinkTransaction(t)}
                                                                className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                                                title="Unlink Pledge"
                                                            >
                                                                <Unlink size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="relative group/select">
                                                            <select 
                                                                onChange={(e) => handleLinkTransaction(t, e.target.value)}
                                                                value=""
                                                                className="appearance-none bg-slate-50 border border-transparent hover:border-slate-200 text-xs text-slate-500 rounded px-2 py-1 pr-6 focus:ring-1 focus:ring-slate-900 outline-none w-full max-w-[150px] cursor-pointer"
                                                            >
                                                                <option value="">Link Pledge...</option>
                                                                {activePledges.map(p => (
                                                                    <option key={p.id} value={p.id}>
                                                                        {funds.find(f => f.id === p.fundId)?.name} (£{p.amount})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <LinkIcon size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    )
                                                ) : <span className="text-[10px] text-slate-300 uppercase">-</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="swiss-card p-6 bg-slate-50">
               <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-900 flex items-center gap-2 font-display"><Sparkles size={16} className="text-indigo-500"/> AI Communication</h3>
                   <button onClick={handleGenerateCommunication} className="text-xs text-indigo-600 font-bold uppercase hover:underline">Draft Email</button>
               </div>
               {generatedComm && <textarea className="w-full h-32 p-3 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-slate-900" value={generatedComm} readOnly />}
            </div>
          </>
        ) : <div className="flex items-center justify-center h-full text-slate-300">Select a donor</div>}
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-slate-200 animate-enter">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Edit Donor Profile</h3>
                      <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                  </div>
                  <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Full Name</label>
                            <input 
                                type="text" 
                                value={formData.name || ''} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                            <input 
                                type="email" 
                                value={formData.email || ''} 
                                onChange={e => setFormData({...formData, email: e.target.value})}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Phone</label>
                            <input 
                                type="tel" 
                                value={formData.phone || ''} 
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                            />
                        </div>
                      </div>

                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Address</label>
                          <textarea 
                              value={formData.address || ''} 
                              onChange={e => setFormData({...formData, address: e.target.value})}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors h-20 resize-none"
                          />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                              <select 
                                  value={formData.type || 'Individual'} 
                                  onChange={e => setFormData({...formData, type: e.target.value as any})}
                                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                              >
                                  <option value="Individual">Individual</option>
                                  <option value="Organization">Organization</option>
                              </select>
                          </div>
                          <div className="flex items-end pb-3">
                             <label className="flex items-center gap-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    checked={formData.isGiftAidActive || false}
                                    onChange={e => setFormData({...formData, isGiftAidActive: e.target.checked})}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-0 w-4 h-4"
                                />
                                <span className="text-sm font-medium text-slate-600 group-hover:text-emerald-700 transition-colors">Gift Aid Active</span>
                             </label>
                          </div>
                      </div>

                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Private Notes</label>
                          <textarea 
                              value={formData.notes || ''} 
                              onChange={e => setFormData({...formData, notes: e.target.value})}
                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none h-20 resize-none"
                          />
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                          <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                          <button type="submit" className="px-6 py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-slate-800 flex items-center gap-2">
                              <Save size={14} /> Save Changes
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Add Pledge Modal */}
      {showAddPledgeModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-slate-200 animate-enter">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">New Schedule</h3>
                    <button onClick={() => setShowAddPledgeModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                </div>
                <form onSubmit={handleAddPledgeSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Target Fund</label>
                        <select 
                            value={newPledgeData.fundId || ''} 
                            onChange={e => setNewPledgeData({...newPledgeData, fundId: e.target.value})}
                            className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                            required
                        >
                            <option value="">Select Fund...</option>
                            {funds.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Amount</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
                                <input 
                                    type="number" 
                                    value={newPledgeData.amount || ''} 
                                    onChange={e => setNewPledgeData({...newPledgeData, amount: parseFloat(e.target.value)})}
                                    className="w-full pl-6 p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Frequency</label>
                            <select 
                                value={newPledgeData.frequency} 
                                onChange={e => setNewPledgeData({...newPledgeData, frequency: e.target.value as any})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="One-off">One-off</option>
                                <option value="Weekly">Weekly</option>
                                <option value="Monthly">Monthly</option>
                                <option value="Annual">Annual</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Start Date</label>
                             <input 
                                type="date"
                                value={newPledgeData.startDate}
                                onChange={e => setNewPledgeData({...newPledgeData, startDate: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                required
                             />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">End Date (Optional)</label>
                             <input 
                                type="date"
                                value={newPledgeData.endDate || ''}
                                onChange={e => setNewPledgeData({...newPledgeData, endDate: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                             />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button type="button" onClick={() => setShowAddPledgeModal(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button>
                        <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            <Plus size={14} /> Create Schedule
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default DonorManager;