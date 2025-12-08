import React, { useState } from 'react';
import { Donor, Transaction, Pledge, Fund, TransactionType, AppUser, ChurchDetails } from '../types';
import { generateDonorCommunication } from '../services/gemini';
import { generateScheduleHTML } from '../services/pdfGenerator';
import { Plus, User, Calendar, Mail, Phone, MapPin, Gift, Sparkles, Search, History, Wallet, Edit2, X, Save, Link as LinkIcon, Unlink, FileText, Printer, ShieldAlert, LayoutDashboard, UserCog, MessageSquare, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DonorManagerProps {
  donors: Donor[];
  transactions: Transaction[];
  pledges: Pledge[];
  funds: Fund[];
  onAddDonor: (d: Donor) => void;
  onUpdateDonor: (d: Donor) => void;
  onAddPledge: (p: Pledge) => void;
  onUpdatePledge: (p: Pledge) => void;
  onUpdateTransaction: (t: Transaction) => void;
  currentUser: AppUser;
  churchDetails?: ChurchDetails; 
}

const DonorManager: React.FC<DonorManagerProps> = ({ donors, transactions, pledges, funds, onAddDonor, onUpdateDonor, onAddPledge, onUpdatePledge, onUpdateTransaction, currentUser, churchDetails }) => {
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
  const [newDonorData, setNewDonorData] = useState<Partial<Donor>>({ type: 'Individual', isGiftAidActive: false, communicationPreference: 'Email' });
  const [newPledgeData, setNewPledgeData] = useState<Partial<Pledge>>({ frequency: 'Monthly', status: 'Active', startDate: new Date().toISOString().split('T')[0] });

  const canEdit = ['Admin', 'Finance Team'].includes(currentUser.role);
  const canView = ['Admin', 'Finance Team'].includes(currentUser.role);

  if (!canView) {
      return (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-grey-mid">
              <div className="w-16 h-16 bg-grey-light rounded-2xl flex items-center justify-center mb-6 text-ledger"><ShieldAlert size={32} /></div>
              <h2 className="text-lg font-bold text-ink font-mono mb-2">Access Restricted</h2>
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

  const openWhatsApp = () => {
      if (!selectedDonor?.phone) return;
      const cleanPhone = selectedDonor.phone.replace(/[^0-9]/g, '');
      const formatted = cleanPhone.startsWith('0') ? '44' + cleanPhone.substring(1) : cleanPhone;
      window.open(`https://wa.me/${formatted}`, '_blank');
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
              postcode: newDonorData.postcode,
              notes: newDonorData.notes,
              type: newDonorData.type || 'Individual',
              isGiftAidActive: newDonorData.isGiftAidActive,
              communicationPreference: newDonorData.communicationPreference
          };
          onAddDonor(newDonor);
          setShowAddDonorModal(false);
          setNewDonorData({ type: 'Individual', isGiftAidActive: false, communicationPreference: 'Email' });
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

  const handleLinkTransaction = (transaction: Transaction, pledgeId: string) => {
      if (!pledgeId) return;
      // We rely on the parent component (App.tsx) handling onUpdateTransaction to check for completion
      onUpdateTransaction({ ...transaction, pledgeId });
  };

  const handleUnlinkTransaction = (transaction: Transaction) => {
      const oldPledgeId = transaction.pledgeId;
      if (!oldPledgeId) return;

      onUpdateTransaction({ ...transaction, pledgeId: undefined });

      // Check if unlinking should reactivate a completed pledge
      const pledge = pledges.find(p => p.id === oldPledgeId);
      if (pledge && pledge.status === 'Completed') {
           const remainingSum = transactions
              .filter(t => t.pledgeId === oldPledgeId && t.id !== transaction.id)
              .reduce((sum, t) => sum + t.amount, 0);
           
           if (remainingSum < pledge.amount) {
                onUpdatePledge({ ...pledge, status: 'Active' });
           }
      }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] animate-enter gap-0 swiss-card overflow-hidden relative">
      {/* Sidebar - Directory */}
      <div className="w-80 border-r border-ledger bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-ledger space-y-3">
          <div className="flex justify-between items-center">
              <h3 className="font-bold text-ink text-sm font-mono">Directory</h3>
              {canEdit && <button onClick={() => setShowAddDonorModal(true)} className="p-1.5 bg-grey-light hover:bg-ledger rounded text-grey-dark transition-colors shadow-sm" title="Add New Donor"><Plus size={14} /></button>}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" size={14} />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 text-xs border border-ledger rounded-md focus:outline-none focus:ring-1 focus:ring-ink bg-paper focus:bg-white transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredDonors.map(donor => (
            <button key={donor.id} onClick={() => { setSelectedDonorId(donor.id); setGeneratedComm(''); }} className={`w-full text-left px-4 py-3 border-b border-grey-light transition-colors flex items-center gap-3 ${selectedDonorId === donor.id ? 'bg-paper border-l-4 border-l-ink' : 'hover:bg-paper border-l-4 border-l-transparent'}`}>
              <div className="w-8 h-8 bg-ledger rounded-full flex items-center justify-center text-xs font-bold text-grey-dark shrink-0">{donor.name.charAt(0)}</div>
              <div className="min-w-0"><div className={`text-sm font-bold truncate ${selectedDonorId === donor.id ? 'text-ink' : 'text-grey-dark'}`}>{donor.name}</div><div className="text-[10px] text-grey-mid truncate">{donor.email || donor.type}</div></div>
            </button>
          ))}
          {filteredDonors.length === 0 && <div className="p-8 text-center text-grey-mid text-xs">No donors found.</div>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-paper overflow-hidden">
        {selectedDonor ? (
          <>
            <div className="bg-white border-b border-ledger px-6 py-4 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-ink rounded-lg flex items-center justify-center text-white text-xl font-bold font-mono shadow-sm">{selectedDonor.name.charAt(0)}</div>
                  <div>
                      <h1 className="text-xl font-bold text-ink font-mono leading-tight">{selectedDonor.name}</h1>
                      <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-grey-mid font-medium">{selectedDonor.type}</span>
                          {selectedDonor.isGiftAidActive && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-sage-light text-sage-dark border border-sage/30"><Gift size={10} /> Gift Aid</span>}
                      </div>
                  </div>
               </div>
               <div className="flex items-center gap-6">
                   <div className="text-right hidden sm:block"><p className="text-[10px] font-bold text-grey-mid uppercase tracking-widest font-mono">LTV</p><p className="text-xl font-bold text-ink font-mono tracking-tight">£{lifetimeValue.toLocaleString()}</p></div>
                   <div className="h-8 w-px bg-grey-light hidden sm:block"></div>
                   <div className="flex gap-2">
                       {canEdit && <button onClick={handleEditClick} className="flex items-center gap-2 px-3 py-2 bg-white border border-ledger rounded text-xs font-bold text-grey-dark hover:border-grey-mid transition-colors"><Edit2 size={14} /> <span className="hidden lg:inline">Edit</span></button>}
                       <button onClick={handlePrintSchedule} className="flex items-center gap-2 px-3 py-2 bg-white border border-ledger rounded text-xs font-bold text-grey-dark hover:border-grey-mid transition-colors"><Printer size={14} /> <span className="hidden lg:inline">Export</span></button>
                   </div>
               </div>
            </div>
            <div className="bg-white border-b border-ledger px-6 flex items-center gap-6 sticky top-0 z-10">
                {[
                    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                    { id: 'history', label: 'History', icon: History },
                    { id: 'profile', label: 'Profile', icon: UserCog },
                    { id: 'communicate', label: 'Communicate', icon: MessageSquare },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${activeTab === tab.id ? 'border-amber text-amber-dark' : 'border-transparent text-grey-mid hover:text-ink'}`}>
                        <tab.icon size={14} /> {tab.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
                        <div className="swiss-card p-6 bg-white">
                             <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-ink text-sm uppercase tracking-wide flex items-center gap-2"><Calendar size={16}/> Giving Schedules</h3>
                                {canEdit && <button onClick={() => setShowAddPledgeModal(true)} className="text-xs bg-ink text-white px-3 py-1.5 rounded-md font-bold uppercase tracking-wide hover:bg-charcoal transition-colors">+ New</button>}
                             </div>
                             {donorPledges.length === 0 ? <div className="p-8 text-center bg-paper rounded-lg border border-dashed border-ledger"><p className="text-sm text-grey-mid font-medium">No active pledges.</p></div> : (
                                <div className="space-y-3">
                                {donorPledges.map(p => (
                                    <div key={p.id} className="flex justify-between items-center p-3 border border-ledger rounded-lg hover:bg-paper transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-md ${p.status === 'Active' ? 'bg-sage-light text-sage' : 'bg-grey-light text-grey-mid'}`}><Wallet size={16} /></div>
                                            <div><div className="font-bold text-ink text-sm">{funds.find(f => f.id === p.fundId)?.name}</div><div className="text-xs text-grey-mid font-medium">{p.frequency}</div></div>
                                        </div>
                                        <div className="text-right"><div className="font-bold text-ink font-mono">£{p.amount}</div><div className={`text-[10px] font-bold uppercase tracking-wide ${p.status === 'Active' ? 'text-sage' : 'text-grey-mid'}`}>{p.status}</div></div>
                                    </div>
                                ))}
                                </div>
                             )}
                        </div>
                        <div className="swiss-card p-6 bg-white">
                            <h3 className="font-bold text-ink mb-6 text-sm uppercase tracking-wide">Giving Trend (Last 10)</h3>
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
                         <div className="p-4 border-b border-ledger bg-paper/50 flex justify-between items-center"><div className="text-sm font-bold text-grey-dark">Transaction Ledger</div><div className="text-xs font-mono text-grey-mid">{donorTransactions.length} RECORDS</div></div>
                         {donorTransactions.length === 0 ? <div className="p-12 text-center text-grey-mid"><History size={32} className="mx-auto mb-2 opacity-20"/><p className="text-sm">No transaction history found.</p></div> : (
                            <table className="w-full text-left ledger-table">
                                <thead className="bg-white"><tr><th className="pl-6 py-4">Date</th><th className="px-4 py-4">Description</th><th className="px-4 py-4 text-right">Amount</th><th className="px-4 py-4">Fund</th><th className="px-4 py-4">Pledge Link</th></tr></thead>
                                <tbody>
                                    {donorTransactions.map(t => {
                                        const linkedPledge = pledges.find(p => p.id === t.pledgeId);
                                        return (
                                            <tr key={t.id} className="hover:bg-paper transition-colors group">
                                                <td className="pl-6 py-3 text-grey-mid font-mono text-xs border-b border-grey-light">{t.date}</td>
                                                <td className="px-4 py-3 font-medium text-ink text-sm border-b border-grey-light">{t.description}</td>
                                                <td className={`px-4 py-3 font-mono text-sm font-bold text-right border-b border-grey-light ${t.type === TransactionType.INCOME ? 'text-sage' : 'text-ink'}`}>{t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}</td>
                                                <td className="px-4 py-3 border-b border-grey-light"><span className="px-2 py-0.5 bg-grey-light rounded text-[10px] font-bold text-grey-dark uppercase tracking-wide border border-ledger">{funds.find(f => f.id === t.fundId)?.name}</span></td>
                                                <td className="px-4 py-3 border-b border-grey-light">
                                                    {t.type === TransactionType.INCOME && canEdit ? (
                                                        linkedPledge ? <div className="flex items-center gap-2"><div className="px-2 py-1 bg-sage-light text-sage-dark rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 border border-sage/30"><LinkIcon size={10} /> Linked</div><button onClick={() => handleUnlinkTransaction(t)} className="text-grey-mid hover:text-error transition-colors p-1" title="Unlink"><Unlink size={12} /></button></div> : 
                                                        <div className="relative group/select">
                                                            <select onChange={(e) => handleLinkTransaction(t, e.target.value)} value="" className="appearance-none bg-white border border-ledger hover:border-grey-mid text-xs text-grey-mid rounded px-2 py-1 pr-6 focus:ring-1 focus:ring-ink outline-none w-full max-w-[140px] cursor-pointer">
                                                                <option value="">Link Pledge...</option>
                                                                {activePledges.map(p => <option key={p.id} value={p.id}>{funds.find(f => f.id === p.fundId)?.name} (£{p.amount})</option>)}
                                                            </select>
                                                            <LinkIcon size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
                                                        </div>
                                                    ) : <span className="text-ledger">-</span>}
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
                             <h3 className="font-bold text-ink mb-4 text-sm uppercase tracking-wide flex items-center gap-2"><User size={16} /> Contact Details</h3>
                             <div className="space-y-4">
                                 <div className="flex items-center gap-3 p-3 bg-paper rounded-lg border border-ledger"><Mail size={16} className="text-grey-mid"/><span className="text-sm font-medium text-grey-dark">{selectedDonor.email || 'No email provided'}</span></div>
                                 <div className="flex items-center justify-between p-3 bg-paper rounded-lg border border-ledger">
                                     <div className="flex items-center gap-3">
                                         <Phone size={16} className="text-grey-mid"/>
                                         <span className="text-sm font-medium text-grey-dark">{selectedDonor.phone || 'No phone number'}</span>
                                     </div>
                                     {selectedDonor.phone && (
                                         <button onClick={openWhatsApp} className="p-1.5 bg-[#25D366] text-white rounded hover:bg-[#128C7E] transition-colors" title="Message on WhatsApp">
                                             <MessageSquare size={14} />
                                         </button>
                                     )}
                                 </div>
                                 <div className="flex items-start gap-3 p-3 bg-paper rounded-lg border border-ledger">
                                     <MapPin size={16} className="text-grey-mid mt-0.5 shrink-0"/>
                                     <div className="flex-1">
                                        <span className="text-sm font-medium text-grey-dark block whitespace-pre-wrap">{selectedDonor.address || 'No address on file'}</span>
                                        {selectedDonor.postcode && <span className="text-xs text-grey-mid font-mono block mt-1">{selectedDonor.postcode}</span>}
                                     </div>
                                 </div>
                             </div>
                        </div>
                        <div className="swiss-card p-6 bg-white">
                             <h3 className="font-bold text-ink mb-4 text-sm uppercase tracking-wide flex items-center gap-2"><FileText size={16} /> Notes & Settings</h3>
                             <div className="bg-amber-light p-4 rounded-lg border border-amber/30 mb-4"><p className="text-xs text-amber-dark italic min-h-[60px]">{selectedDonor.notes || 'No private notes added.'}</p></div>
                             <div className="space-y-2">
                                <div className="flex justify-between items-center p-3 bg-paper rounded-lg border border-ledger"><span className="text-sm font-bold text-grey-dark">Donor Type</span><span className="text-xs font-mono text-grey-mid uppercase">{selectedDonor.type}</span></div>
                                <div className="flex justify-between items-center p-3 bg-paper rounded-lg border border-ledger"><span className="text-sm font-bold text-grey-dark">Comm. Pref</span><span className="text-xs font-mono text-grey-mid uppercase">{selectedDonor.communicationPreference || 'Email'}</span></div>
                             </div>
                        </div>
                    </div>
                )}
                {activeTab === 'communicate' && (
                    <div className="swiss-card p-6 bg-white max-w-4xl">
                        <div className="flex justify-between items-center mb-4">
                           <h3 className="font-bold text-ink flex items-center gap-2 text-sm uppercase tracking-wide"><Sparkles size={16} className="text-amber"/> AI Draft Assistant</h3>
                           {canEdit && <button onClick={handleGenerateCommunication} className="flex items-center gap-2 px-3 py-1.5 bg-sage-light text-sage-dark hover:bg-sage/20 rounded text-xs font-bold uppercase tracking-wide transition-colors"><Sparkles size={12}/> Generate Draft</button>}
                       </div>
                       <textarea className="w-full h-64 p-4 text-sm border border-ledger rounded-lg focus:ring-1 focus:ring-ink focus:border-grey-mid outline-none leading-relaxed resize-none font-serif text-grey-dark" value={generatedComm} placeholder="Select 'Generate Draft' to create a personalized email based on recent giving..." readOnly />
                        <div className="flex justify-end gap-3 mt-4"><button className="px-4 py-2 text-xs font-bold text-grey-mid uppercase tracking-wide hover:text-ink">Copy to Clipboard</button></div>
                    </div>
                )}
            </div>
          </>
        ) : <div className="flex flex-col items-center justify-center h-full text-ledger space-y-4"><div className="w-20 h-20 bg-grey-light rounded-full flex items-center justify-center"><User size={32} className="opacity-20" /></div><p className="text-sm font-medium">Select a donor to view details.</p></div>}
      </div>

      {showAddDonorModal && canEdit && (
          <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-ledger animate-enter">
                  <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg"><h3 className="font-bold text-ink text-sm uppercase tracking-wide">New Donor Profile</h3><button onClick={() => setShowAddDonorModal(false)} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button></div>
                  <form onSubmit={handleAddDonorSubmit} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Full Name *</label><input type="text" value={newDonorData.name || ''} onChange={e => setNewDonorData({...newDonorData, name: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors" required placeholder="e.g. John Doe"/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Email</label><input type="email" value={newDonorData.email || ''} onChange={e => setNewDonorData({...newDonorData, email: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Phone</label><input type="tel" value={newDonorData.phone || ''} onChange={e => setNewDonorData({...newDonorData, phone: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Address</label>
                        <textarea value={newDonorData.address || ''} onChange={e => setNewDonorData({...newDonorData, address: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors h-16 resize-none" placeholder="Street, City..."/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Postcode</label><input type="text" value={newDonorData.postcode || ''} onChange={e => setNewDonorData({...newDonorData, postcode: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"/></div>
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Comm. Preference</label><select value={newDonorData.communicationPreference || 'Email'} onChange={e => setNewDonorData({...newDonorData, communicationPreference: e.target.value as any})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="Email">Email</option><option value="Post">Post</option><option value="Phone">Phone</option></select></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Type</label><select value={newDonorData.type || 'Individual'} onChange={e => setNewDonorData({...newDonorData, type: e.target.value as any})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="Individual">Individual</option><option value="Organization">Organization</option></select></div>
                          <div className="flex items-end pb-3"><label className="flex items-center gap-2 cursor-pointer group"><input type="checkbox" checked={newDonorData.isGiftAidActive || false} onChange={e => setNewDonorData({...newDonorData, isGiftAidActive: e.target.checked})} className="rounded border-ledger text-sage focus:ring-0 w-4 h-4"/><span className="text-sm font-medium text-grey-dark group-hover:text-sage-dark transition-colors">Gift Aid Active</span></label></div>
                      </div>
                      <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Private Notes</label><textarea value={newDonorData.notes || ''} onChange={e => setNewDonorData({...newDonorData, notes: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none h-16 resize-none"/></div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-ledger"><button type="button" onClick={() => setShowAddDonorModal(false)} className="px-4 py-2 text-xs font-bold uppercase text-grey-mid hover:bg-grey-light rounded">Cancel</button><button type="submit" className="px-6 py-2 bg-ink text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-charcoal flex items-center gap-2"><Plus size={14} /> Create Profile</button></div>
                  </form>
              </div>
          </div>
      )}

      {isEditing && canEdit && (
          <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-ledger animate-enter">
                  <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg"><h3 className="font-bold text-ink text-sm uppercase tracking-wide">Edit Donor Profile</h3><button onClick={() => setIsEditing(false)} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button></div>
                  <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Full Name</label><input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors" required/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Email</label><input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Phone</label><input type="tel" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Address</label>
                          <textarea value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors h-16 resize-none"/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Postcode</label><input type="text" value={formData.postcode || ''} onChange={e => setFormData({...formData, postcode: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"/></div>
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Comm. Preference</label><select value={formData.communicationPreference || 'Email'} onChange={e => setFormData({...formData, communicationPreference: e.target.value as any})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="Email">Email</option><option value="Post">Post</option><option value="Phone">Phone</option></select></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Type</label><select value={formData.type || 'Individual'} onChange={e => setFormData({...formData, type: e.target.value as any})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="Individual">Individual</option><option value="Organization">Organization</option></select></div>
                          <div className="flex items-end pb-3"><label className="flex items-center gap-2 cursor-pointer group"><input type="checkbox" checked={formData.isGiftAidActive || false} onChange={e => setFormData({...formData, isGiftAidActive: e.target.checked})} className="rounded border-ledger text-sage focus:ring-0 w-4 h-4"/><span className="text-sm font-medium text-grey-dark group-hover:text-sage-dark transition-colors">Gift Aid Active</span></label></div>
                      </div>
                      <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Private Notes</label><textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none h-16 resize-none"/></div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-ledger"><button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs font-bold uppercase text-grey-mid hover:bg-grey-light rounded">Cancel</button><button type="submit" className="px-6 py-2 bg-ink text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-charcoal flex items-center gap-2"><Save size={14} /> Save Changes</button></div>
                  </form>
              </div>
          </div>
      )}

      {showAddPledgeModal && canEdit && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-ledger animate-enter">
                <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg"><h3 className="font-bold text-ink text-sm uppercase tracking-wide">New Schedule</h3><button onClick={() => setShowAddPledgeModal(false)} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button></div>
                <form onSubmit={handleAddPledgeSubmit} className="p-6 space-y-4">
                    <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Target Fund</label><select value={newPledgeData.fundId || ''} onChange={e => setNewPledgeData({...newPledgeData, fundId: e.target.value})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors" required><option value="">Select Fund...</option>{funds.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}</select></div>
                    <div className="grid grid-cols-2 gap-4">
                         <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Amount</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid text-xs">£</span><input type="number" value={newPledgeData.amount || ''} onChange={e => setNewPledgeData({...newPledgeData, amount: parseFloat(e.target.value)})} className="w-full pl-6 p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono" placeholder="0.00" required/></div></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Frequency</label><select value={newPledgeData.frequency} onChange={e => setNewPledgeData({...newPledgeData, frequency: e.target.value as any})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="One-off">One-off</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="Annual">Annual</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Start Date</label><input type="date" value={newPledgeData.startDate} onChange={e => setNewPledgeData({...newPledgeData, startDate: e.target.value})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono" required/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">End Date (Optional)</label><input type="date" value={newPledgeData.endDate || ''} onChange={e => setNewPledgeData({...newPledgeData, endDate: e.target.value})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"/></div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-ledger mt-4"><button type="button" onClick={() => setShowAddPledgeModal(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">Cancel</button><button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2"><Plus size={14} /> Create Schedule</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default DonorManager;