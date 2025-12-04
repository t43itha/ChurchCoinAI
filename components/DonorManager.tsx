import React, { useState } from 'react';
import { Donor, Transaction, Pledge, Fund, TransactionType, AppUser, ChurchDetails } from '../types';
import { generateDonorCommunication } from '../services/gemini';
import { generateScheduleHTML } from '../services/pdfGenerator';
import { Plus, User, Calendar, Mail, Phone, MapPin, Gift, Sparkles, Search, History, Wallet, Edit2, X, Save, Link as LinkIcon, Unlink, FileText, Printer, ShieldAlert, LayoutDashboard, UserCog, MessageSquare } from 'lucide-react';
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
  currentUser: AppUser;
  churchDetails?: ChurchDetails; // Added Prop
}

const DonorManager: React.FC<DonorManagerProps> = ({ donors, transactions, pledges, funds, onAddDonor, onUpdateDonor, onAddPledge, onUpdateTransaction, currentUser, churchDetails }) => {
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(donors[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [generatedComm, setGeneratedComm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'profile' | 'communicate'>('overview');
  
  // Modals state
  const [showAddPledgeModal, setShowAddPledgeModal] = useState(false);
  const [showAddDonorModal, setShowAddDonorModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Forms state
  const [formData, setFormData] = useState<Partial<Donor>>({});
  const [newDonorData, setNewDonorData] = useState<Partial<Donor>>({ type: 'Individual', isGiftAidActive: false });
  const [newPledgeData, setNewPledgeData] = useState<Partial<Pledge>>({ frequency: 'Monthly', status: 'Active', startDate: new Date().toISOString().split('T')[0] });

  const canEdit = ['Admin', 'Finance Team'].includes(currentUser.role);
  const canView = ['Admin', 'Finance Team'].includes(currentUser.role);

  if (!canView) {
      return (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-slate-400">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 text-slate-300"><ShieldAlert size={32} /></div>
              <h2 className="text-lg font-bold text-slate-800 font-display mb-2">Access Restricted</h2>
              <p className="text-sm max-w-sm text-center">Your user role ({currentUser.role}) does not have permission to view donor records.</p>
          </div>
      );
  }

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
      setGeneratedComm(comm || "Error generating draft.");
    } catch (e) { console.error(e); }
  };

  const handleEditClick = () => { if (selectedDonor && canEdit) { setFormData(selectedDonor); setIsEditing(true); } };

  const handlePrintSchedule = () => {
    if (!selectedDonor) return;
    // Default to a placeholder if churchDetails is not yet propagated or set
    const details = churchDetails || { name: 'ChurchCoin', address: '', email: '' };
    const html = generateScheduleHTML(selectedDonor, donorPledges, funds, details);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 500);
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedDonor && formData.name) { onUpdateDonor({ ...selectedDonor, ...formData } as Donor); setIsEditing(false); }
  };

  const handleAddDonorSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (newDonorData.name) {
          const newId = Math.random().toString(36).substr(2, 9);
          const newDonor: Donor = {
              id: newId,
              name: newDonorData.name,
              email: newDonorData.email,
              phone: newDonorData.phone,
              address: newDonorData.address,
              notes: newDonorData.notes,
              type: newDonorData.type || 'Individual',
              isGiftAidActive: newDonorData.isGiftAidActive
          };
          onAddDonor(newDonor);
          setShowAddDonorModal(false);
          setNewDonorData({ type: 'Individual', isGiftAidActive: false });
          setSelectedDonorId(newId);
          setActiveTab('profile'); 
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
        setNewPledgeData({ frequency: 'Monthly', status: 'Active', startDate: new Date().toISOString().split('T')[0] });
    }
  };

  const handleLinkTransaction = (transaction: Transaction, pledgeId: string) => { if (pledgeId) onUpdateTransaction({ ...transaction, pledgeId }); };
  const handleUnlinkTransaction = (transaction: Transaction) => { onUpdateTransaction({ ...transaction, pledgeId: undefined }); };

  return (
    <div className="flex h-[calc(100vh-8rem)] animate-enter gap-0 swiss-card overflow-hidden">
      {/* Sidebar - Directory */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm font-display">Directory</h3>
              {canEdit && <button onClick={() => setShowAddDonorModal(true)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition-colors shadow-sm" title="Add New Donor"><Plus size={14} /></button>}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 bg-slate-50 focus:bg-white transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredDonors.map(donor => (
            <button key={donor.id} onClick={() => { setSelectedDonorId(donor.id); setGeneratedComm(''); }} className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors flex items-center gap-3 ${selectedDonorId === donor.id ? 'bg-slate-50 border-l-4 border-l-slate-900' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
              <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">{donor.name.charAt(0)}</div>
              <div className="min-w-0"><div className={`text-sm font-bold truncate ${selectedDonorId === donor.id ? 'text-slate-900' : 'text-slate-700'}`}>{donor.name}</div><div className="text-[10px] text-slate-500 truncate">{donor.email || donor.type}</div></div>
            </button>
          ))}
          {filteredDonors.length === 0 && <div className="p-8 text-center text-slate-400 text-xs">No donors found.</div>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {selectedDonor ? (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center text-white text-xl font-bold font-display shadow-sm">{selectedDonor.name.charAt(0)}</div>
                  <div>
                      <h1 className="text-xl font-bold text-slate-900 font-display leading-tight">{selectedDonor.name}</h1>
                      <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500 font-medium">{selectedDonor.type}</span>
                          {selectedDonor.isGiftAidActive && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-100"><Gift size={10} /> Gift Aid</span>}
                      </div>
                  </div>
               </div>
               <div className="flex items-center gap-6">
                   <div className="text-right hidden sm:block"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">LTV</p><p className="text-xl font-bold text-slate-900 font-mono tracking-tight">£{lifetimeValue.toLocaleString()}</p></div>
                   <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                   <div className="flex gap-2">
                       {canEdit && <button onClick={handleEditClick} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 hover:border-slate-300 transition-colors"><Edit2 size={14} /> <span className="hidden lg:inline">Edit</span></button>}
                       <button onClick={handlePrintSchedule} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 hover:border-slate-300 transition-colors"><Printer size={14} /> <span className="hidden lg:inline">Export</span></button>
                   </div>
               </div>
            </div>
            <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-6 sticky top-0 z-10">
                {[
                    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                    { id: 'history', label: 'History', icon: History },
                    { id: 'profile', label: 'Profile', icon: UserCog },
                    { id: 'communicate', label: 'Communicate', icon: MessageSquare },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${activeTab === tab.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                        <tab.icon size={14} /> {tab.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
                        <div className="swiss-card p-6 bg-white">
                             <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2"><Calendar size={16}/> Giving Schedules</h3>
                                {canEdit && <button onClick={() => setShowAddPledgeModal(true)} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md font-bold uppercase tracking-wide hover:bg-slate-800 transition-colors">+ New</button>}
                             </div>
                             {donorPledges.length === 0 ? <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200"><p className="text-sm text-slate-400 font-medium">No active pledges.</p></div> : (
                                <div className="space-y-3">
                                {donorPledges.map(p => (
                                    <div key={p.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-md ${p.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><Wallet size={16} /></div>
                                            <div><div className="font-bold text-slate-800 text-sm">{funds.find(f => f.id === p.fundId)?.name}</div><div className="text-xs text-slate-500 font-medium">{p.frequency}</div></div>
                                        </div>
                                        <div className="text-right"><div className="font-bold text-slate-900 font-mono">£{p.amount}</div><div className={`text-[10px] font-bold uppercase tracking-wide ${p.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'}`}>{p.status}</div></div>
                                    </div>
                                ))}
                                </div>
                             )}
                        </div>
                        <div className="swiss-card p-6 bg-white">
                            <h3 className="font-bold text-slate-900 mb-6 text-sm uppercase tracking-wide">Giving Trend (Last 10)</h3>
                             <div className="h-60">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} dy={10}/>
                                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '4px', fontSize: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}} />
                                        <Bar dataKey="amount" fill="#292524" radius={[4, 4, 0, 0]} barSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'history' && (
                    <div className="swiss-card p-0 bg-white overflow-hidden max-w-5xl">
                         <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center"><div className="text-sm font-bold text-slate-700">Transaction Ledger</div><div className="text-xs font-mono text-slate-400">{donorTransactions.length} RECORDS</div></div>
                         {donorTransactions.length === 0 ? <div className="p-12 text-center text-slate-400"><History size={32} className="mx-auto mb-2 opacity-20"/><p className="text-sm">No transaction history found.</p></div> : (
                            <table className="w-full text-left ledger-table">
                                <thead className="bg-white"><tr><th className="pl-6 py-4">Date</th><th className="px-4 py-4">Description</th><th className="px-4 py-4 text-right">Amount</th><th className="px-4 py-4">Fund</th><th className="px-4 py-4">Pledge Link</th></tr></thead>
                                <tbody>
                                    {donorTransactions.map(t => {
                                        const linkedPledge = pledges.find(p => p.id === t.pledgeId);
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="pl-6 py-3 text-slate-500 font-mono text-xs border-b border-slate-50">{t.date}</td>
                                                <td className="px-4 py-3 font-medium text-slate-800 text-sm border-b border-slate-50">{t.description}</td>
                                                <td className={`px-4 py-3 font-mono text-sm font-bold text-right border-b border-slate-50 ${t.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-slate-900'}`}>{t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}</td>
                                                <td className="px-4 py-3 border-b border-slate-50"><span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600 uppercase tracking-wide border border-slate-200">{funds.find(f => f.id === t.fundId)?.name}</span></td>
                                                <td className="px-4 py-3 border-b border-slate-50">
                                                    {t.type === TransactionType.INCOME && canEdit ? (
                                                        linkedPledge ? <div className="flex items-center gap-2"><div className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 border border-indigo-100"><LinkIcon size={10} /> Linked</div><button onClick={() => handleUnlinkTransaction(t)} className="text-slate-400 hover:text-rose-600 transition-colors p-1" title="Unlink"><Unlink size={12} /></button></div> : 
                                                        <div className="relative group/select">
                                                            <select onChange={(e) => handleLinkTransaction(t, e.target.value)} value="" className="appearance-none bg-white border border-slate-200 hover:border-slate-300 text-xs text-slate-500 rounded px-2 py-1 pr-6 focus:ring-1 focus:ring-slate-900 outline-none w-full max-w-[140px] cursor-pointer">
                                                                <option value="">Link Pledge...</option>
                                                                {activePledges.map(p => <option key={p.id} value={p.id}>{funds.find(f => f.id === p.fundId)?.name} (£{p.amount})</option>)}
                                                            </select>
                                                            <LinkIcon size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    ) : <span className="text-slate-300">-</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                         )}
                    </div>
                )}
                {activeTab === 'profile' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                        <div className="swiss-card p-6 bg-white">
                             <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide flex items-center gap-2"><User size={16} /> Contact Details</h3>
                             <div className="space-y-4">
                                 <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"><Mail size={16} className="text-slate-400"/><span className="text-sm font-medium text-slate-700">{selectedDonor.email || 'No email provided'}</span></div>
                                 <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"><Phone size={16} className="text-slate-400"/><span className="text-sm font-medium text-slate-700">{selectedDonor.phone || 'No phone number'}</span></div>
                                 <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"><MapPin size={16} className="text-slate-400 mt-0.5"/><span className="text-sm font-medium text-slate-700">{selectedDonor.address || 'No address on file'}</span></div>
                             </div>
                        </div>
                        <div className="swiss-card p-6 bg-white">
                             <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide flex items-center gap-2"><FileText size={16} /> Notes & Settings</h3>
                             <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 mb-4"><p className="text-xs text-amber-900 italic min-h-[60px]">{selectedDonor.notes || 'No private notes added.'}</p></div>
                             <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100"><span className="text-sm font-bold text-slate-700">Donor Type</span><span className="text-xs font-mono text-slate-500 uppercase">{selectedDonor.type}</span></div>
                        </div>
                    </div>
                )}
                {activeTab === 'communicate' && (
                    <div className="swiss-card p-6 bg-white max-w-4xl">
                        <div className="flex justify-between items-center mb-4">
                           <h3 className="font-bold text-slate-900 flex items-center gap-2 font-display text-sm uppercase tracking-wide"><Sparkles size={16} className="text-indigo-500"/> AI Draft Assistant</h3>
                           {canEdit && <button onClick={handleGenerateCommunication} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-bold uppercase tracking-wide transition-colors"><Sparkles size={12}/> Generate Draft</button>}
                       </div>
                       <textarea className="w-full h-64 p-4 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:border-slate-400 outline-none leading-relaxed resize-none font-serif text-slate-700" value={generatedComm} placeholder="Select 'Generate Draft' to create a personalized email based on recent giving..." readOnly />
                        <div className="flex justify-end gap-3 mt-4"><button className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide hover:text-slate-800">Copy to Clipboard</button></div>
                    </div>
                )}
            </div>
          </>
        ) : <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-4"><div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center"><User size={32} className="opacity-20" /></div><p className="text-sm font-medium">Select a donor to view details.</p></div>}
      </div>

      {showAddDonorModal && canEdit && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-slate-200 animate-enter">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg"><h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">New Donor Profile</h3><button onClick={() => setShowAddDonorModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button></div>
                  <form onSubmit={handleAddDonorSubmit} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Full Name *</label><input type="text" value={newDonorData.name || ''} onChange={e => setNewDonorData({...newDonorData, name: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors" required placeholder="e.g. John Doe"/></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Email</label><input type="email" value={newDonorData.email || ''} onChange={e => setNewDonorData({...newDonorData, email: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"/></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Phone</label><input type="tel" value={newDonorData.phone || ''} onChange={e => setNewDonorData({...newDonorData, phone: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"/></div>
                      </div>
                      <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Address</label><textarea value={newDonorData.address || ''} onChange={e => setNewDonorData({...newDonorData, address: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors h-20 resize-none" placeholder="Street, City, Postcode"/></div>
                      <div className="grid grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label><select value={newDonorData.type || 'Individual'} onChange={e => setNewDonorData({...newDonorData, type: e.target.value as any})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"><option value="Individual">Individual</option><option value="Organization">Organization</option></select></div>
                          <div className="flex items-end pb-3"><label className="flex items-center gap-2 cursor-pointer group"><input type="checkbox" checked={newDonorData.isGiftAidActive || false} onChange={e => setNewDonorData({...newDonorData, isGiftAidActive: e.target.checked})} className="rounded border-slate-300 text-emerald-600 focus:ring-0 w-4 h-4"/><span className="text-sm font-medium text-slate-600 group-hover:text-emerald-700 transition-colors">Gift Aid Active</span></label></div>
                      </div>
                      <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Private Notes</label><textarea value={newDonorData.notes || ''} onChange={e => setNewDonorData({...newDonorData, notes: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none h-20 resize-none"/></div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button type="button" onClick={() => setShowAddDonorModal(false)} className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 rounded">Cancel</button><button type="submit" className="px-6 py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-slate-800 flex items-center gap-2"><Plus size={14} /> Create Profile</button></div>
                  </form>
              </div>
          </div>
      )}

      {isEditing && canEdit && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-slate-200 animate-enter">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg"><h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Edit Donor Profile</h3><button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button></div>
                  <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Full Name</label><input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors" required/></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Email</label><input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"/></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Phone</label><input type="tel" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"/></div>
                      </div>
                      <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Address</label><textarea value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors h-20 resize-none"/></div>
                      <div className="grid grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label><select value={formData.type || 'Individual'} onChange={e => setFormData({...formData, type: e.target.value as any})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"><option value="Individual">Individual</option><option value="Organization">Organization</option></select></div>
                          <div className="flex items-end pb-3"><label className="flex items-center gap-2 cursor-pointer group"><input type="checkbox" checked={formData.isGiftAidActive || false} onChange={e => setFormData({...formData, isGiftAidActive: e.target.checked})} className="rounded border-slate-300 text-emerald-600 focus:ring-0 w-4 h-4"/><span className="text-sm font-medium text-slate-600 group-hover:text-emerald-700 transition-colors">Gift Aid Active</span></label></div>
                      </div>
                      <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Private Notes</label><textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none h-20 resize-none"/></div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 rounded">Cancel</button><button type="submit" className="px-6 py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-slate-800 flex items-center gap-2"><Save size={14} /> Save Changes</button></div>
                  </form>
              </div>
          </div>
      )}

      {showAddPledgeModal && canEdit && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-slate-200 animate-enter">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg"><h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">New Schedule</h3><button onClick={() => setShowAddPledgeModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button></div>
                <form onSubmit={handleAddPledgeSubmit} className="p-6 space-y-4">
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Target Fund</label><select value={newPledgeData.fundId || ''} onChange={e => setNewPledgeData({...newPledgeData, fundId: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors" required><option value="">Select Fund...</option>{funds.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}</select></div>
                    <div className="grid grid-cols-2 gap-4">
                         <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Amount</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span><input type="number" value={newPledgeData.amount || ''} onChange={e => setNewPledgeData({...newPledgeData, amount: parseFloat(e.target.value)})} className="w-full pl-6 p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono" placeholder="0.00" required/></div></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Frequency</label><select value={newPledgeData.frequency} onChange={e => setNewPledgeData({...newPledgeData, frequency: e.target.value as any})} className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"><option value="One-off">One-off</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="Annual">Annual</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Start Date</label><input type="date" value={newPledgeData.startDate} onChange={e => setNewPledgeData({...newPledgeData, startDate: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono" required/></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">End Date (Optional)</label><input type="date" value={newPledgeData.endDate || ''} onChange={e => setNewPledgeData({...newPledgeData, endDate: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"/></div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4"><button type="button" onClick={() => setShowAddPledgeModal(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button><button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2"><Plus size={14} /> Create Schedule</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default DonorManager;