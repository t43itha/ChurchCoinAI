import React, { useState, useRef } from 'react';
import { Fund, Pledge, Transaction, AppUser, Donor } from '../types';
import { reconcilePledges, generatePledgeCompletionMessage } from '../services/gemini';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Upload, Users, Calendar, Wand2, Check, X, Lock, Plus, FileSpreadsheet, ArrowRight, Table as TableIcon, Edit2, Target, Save, MessageSquare, Phone, Mail, Loader2, Copy } from 'lucide-react';

interface CampaignsProps {
    funds: Fund[];
    pledges: Pledge[];
    transactions: Transaction[];
    donors: Donor[]; 
    onAddPledge: (p: Pledge) => void;
    onUpdatePledge: (p: Pledge) => void;
    onBulkAddPledges: (ps: Pledge[]) => void;
    onBulkAddDonors: (ds: Donor[]) => void;
    onUpdateTransaction: (t: Transaction) => void;
    currentUser: AppUser;
}

const COLORS = ['#10b981', '#e2e8f0'];

const Campaigns: React.FC<CampaignsProps> = ({ funds, pledges, transactions, donors, onAddPledge, onUpdatePledge, onBulkAddPledges, onBulkAddDonors, onUpdateTransaction, currentUser }) => {
    const [selectedFundId, setSelectedFundId] = useState<string>(funds.find(f => f.type === 'Restricted')?.id || funds[0].id);
    const [isReconciling, setIsReconciling] = useState(false);
    const [matches, setMatches] = useState<any[]>([]);

    // Completion / Thank You Logic
    const [thankYouModal, setThankYouModal] = useState<{ isOpen: boolean; pledge: Pledge | null; text: string; isGenerating: boolean }>({
        isOpen: false, pledge: null, text: '', isGenerating: false
    });

    // State for modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPledge, setEditingPledge] = useState<Pledge | null>(null);

    // Form State
    const [pledgeForm, setPledgeForm] = useState<Partial<Pledge>>({
        frequency: 'Monthly',
        status: 'Active',
        startDate: new Date().toISOString().split('T')[0]
    });

    // CSV Import State
    const [showCsvMapper, setShowCsvMapper] = useState(false);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<string[][]>([]);
    const [columnMapping, setColumnMapping] = useState({ 
        donor: '', 
        amount: '', 
        frequency: '',
        email: '',
        phone: '',
        address: '',
        postcode: '',
        commPref: ''
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canEdit = ['Admin', 'Finance Team'].includes(currentUser.role);

    const selectedFund = funds.find(f => f.id === selectedFundId);
    const campaignPledges = pledges.filter(p => p.fundId === selectedFundId);
    
    const totalPledged = campaignPledges.reduce((acc, p) => acc + p.amount, 0);
    const totalCollected = transactions.filter(t => t.fundId === selectedFundId && t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const target = selectedFund?.targetAmount || totalPledged * 1.2; 
    const percentComplete = Math.min((totalCollected / target) * 100, 100);

    const pieData = [{ name: 'Collected', value: totalCollected }, { name: 'Remaining', value: Math.max(0, target - totalCollected) }];

    // --- Actions ---

    const handleAIReconcile = async () => {
        setIsReconciling(true);
        try {
            const results = await reconcilePledges(transactions, pledges);
            setMatches(results);
        } catch (e) { console.error(e); } finally { setIsReconciling(false); }
    };

    const handleConfirmMatch = (match: any) => {
        const t = transactions.find(tr => tr.id === match.transactionId);
        if (t) {
            onUpdateTransaction({
                ...t,
                pledgeId: match.pledgeId,
                donorName: match.donorName || t.donorName
            });
            setMatches(prev => prev.filter(m => m !== match));
        }
    };

    const handleRejectMatch = (match: any) => {
        setMatches(prev => prev.filter(m => m !== match));
    };

    const handleThankDonor = async (pledge: Pledge) => {
        setThankYouModal({ isOpen: true, pledge, text: '', isGenerating: true });
        try {
            const fundName = funds.find(f => f.id === pledge.fundId)?.name || 'Campaign';
            const text = await generatePledgeCompletionMessage(pledge.donorName, pledge.amount, fundName);
            setThankYouModal(prev => ({ ...prev, text: text || "Thank you for your generous support!", isGenerating: false }));
        } catch (e) {
            setThankYouModal(prev => ({ ...prev, text: "Error generating message.", isGenerating: false }));
        }
    };

    const sendViaWhatsApp = () => {
        if (!thankYouModal.pledge) return;
        const donor = donors.find(d => d.id === thankYouModal.pledge?.donorId);
        if (donor && donor.phone) {
            const cleanPhone = donor.phone.replace(/[^0-9]/g, '');
            // Simple robust check for UK international format
            const formatted = cleanPhone.startsWith('0') ? '44' + cleanPhone.substring(1) : cleanPhone;
            const url = `https://wa.me/${formatted}?text=${encodeURIComponent(thankYouModal.text)}`;
            window.open(url, '_blank');
        } else {
            alert("No phone number found for this donor.");
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(thankYouModal.text);
        alert("Message copied to clipboard.");
    };

    const handleAddPledgeClick = () => {
        setPledgeForm({ frequency: 'Monthly', status: 'Active', startDate: new Date().toISOString().split('T')[0] });
        setShowAddModal(true);
    }

    const handleEditPledgeClick = (p: Pledge) => {
        setEditingPledge(p);
        setPledgeForm(p);
    };

    const handlePledgeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!pledgeForm.donorName || !pledgeForm.amount) return;

        if (editingPledge) {
            // Update
            onUpdatePledge({
                ...editingPledge,
                ...pledgeForm as Pledge
            });
            setEditingPledge(null);
        } else {
            const existingDonor = donors.find(d => d.name.toLowerCase() === pledgeForm.donorName?.toLowerCase());
            
            const pledge: Pledge = {
                id: Math.random().toString(36).substr(2, 9),
                donorName: pledgeForm.donorName,
                donorId: existingDonor?.id,
                amount: Number(pledgeForm.amount),
                fundId: selectedFundId,
                frequency: pledgeForm.frequency as any || 'Monthly',
                startDate: pledgeForm.startDate || new Date().toISOString().split('T')[0],
                endDate: pledgeForm.endDate,
                status: pledgeForm.status || 'Active'
            };
            onAddPledge(pledge);
            setShowAddModal(false);
        }
    };

    // --- CSV Import Handlers ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) { alert("Invalid CSV"); return; }

            const parseLine = (line: string) => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim().replace(/^"|"$/g, ''));
            const headers = parseLine(lines[0]);
            const rows = lines.slice(1).map(parseLine);

            setCsvHeaders(headers);
            setCsvRows(rows);

            // Auto-guess columns
            const newMapping = { 
                donor: '', amount: '', frequency: '', 
                email: '', phone: '', address: '', postcode: '', commPref: '' 
            };
            
            headers.forEach(h => {
                const lower = h.toLowerCase();
                if ((lower.includes('name') || lower.includes('donor')) && !newMapping.donor) newMapping.donor = h;
                else if ((lower.includes('amount') || lower.includes('value')) && !newMapping.amount) newMapping.amount = h;
                else if ((lower.includes('freq') || lower.includes('period')) && !newMapping.frequency) newMapping.frequency = h;
                else if (lower.includes('email') && !newMapping.email) newMapping.email = h;
                else if ((lower.includes('phone') || lower.includes('tel') || lower.includes('mobile')) && !newMapping.phone) newMapping.phone = h;
                else if (lower.includes('postcode') && !newMapping.postcode) newMapping.postcode = h;
                else if ((lower.includes('address') || lower.includes('street')) && !newMapping.address) newMapping.address = h;
                else if ((lower.includes('pref') || lower.includes('comm') || lower.includes('contact')) && !newMapping.commPref) newMapping.commPref = h;
            });
            setColumnMapping(newMapping);
            setShowCsvMapper(true);
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleProcessImport = () => {
        const donorIdx = csvHeaders.indexOf(columnMapping.donor);
        const amountIdx = csvHeaders.indexOf(columnMapping.amount);
        const freqIdx = csvHeaders.indexOf(columnMapping.frequency);
        
        // Optional indices
        const emailIdx = csvHeaders.indexOf(columnMapping.email);
        const phoneIdx = csvHeaders.indexOf(columnMapping.phone);
        const addressIdx = csvHeaders.indexOf(columnMapping.address);
        const postcodeIdx = csvHeaders.indexOf(columnMapping.postcode);
        const commPrefIdx = csvHeaders.indexOf(columnMapping.commPref);

        if (donorIdx === -1 || amountIdx === -1) {
            alert("Donor Name and Amount columns are required.");
            return;
        }

        const newPledges: Pledge[] = [];
        const donorsToUpsert = new Map<string, Donor>(); // Key by ID

        csvRows.forEach(row => {
            const donorName = row[donorIdx];
            let amountStr = row[amountIdx] || '0';
            amountStr = amountStr.replace(/[£$,]/g, '');
            const amount = parseFloat(amountStr);
            const freqRaw = freqIdx !== -1 ? row[freqIdx] : 'Monthly';
            
            // Normalize frequency
            let frequency: any = 'One-off';
            if (freqRaw.toLowerCase().includes('month')) frequency = 'Monthly';
            else if (freqRaw.toLowerCase().includes('week')) frequency = 'Weekly';
            else if (freqRaw.toLowerCase().includes('year') || freqRaw.toLowerCase().includes('ann')) frequency = 'Annual';

            if (donorName && amount > 0) {
                // Check if donor exists in current database OR in the upsert map we are building
                const existingDonor = donors.find(d => d.name.toLowerCase() === donorName.toLowerCase());
                
                let donorId = existingDonor?.id;
                let donorObj: Donor;

                // Extract optional details
                const email = emailIdx !== -1 ? row[emailIdx] : undefined;
                const phone = phoneIdx !== -1 ? row[phoneIdx] : undefined;
                const address = addressIdx !== -1 ? row[addressIdx] : undefined;
                const postcode = postcodeIdx !== -1 ? row[postcodeIdx] : undefined;
                const commPrefRaw = commPrefIdx !== -1 ? row[commPrefIdx] : undefined;
                
                let commPref: 'Email'|'Post'|'Phone' | undefined;
                if (commPrefRaw) {
                    const c = commPrefRaw.toLowerCase();
                    if (c.includes('email')) commPref = 'Email';
                    else if (c.includes('post') || c.includes('mail')) commPref = 'Post';
                    else if (c.includes('phone')) commPref = 'Phone';
                }

                if (existingDonor) {
                    donorId = existingDonor.id;
                    // Update existing with new info if present
                    donorObj = {
                        ...existingDonor,
                        email: email || existingDonor.email,
                        phone: phone || existingDonor.phone,
                        address: address || existingDonor.address,
                        postcode: postcode || existingDonor.postcode,
                        communicationPreference: commPref || existingDonor.communicationPreference
                    };
                } else {
                    // Check if we already created a donor for this name in this batch
                    const foundInBatch = Array.from(donorsToUpsert.values()).find(d => d.name.toLowerCase() === donorName.toLowerCase());
                    if (foundInBatch) {
                        donorId = foundInBatch.id;
                        donorObj = { ...foundInBatch }; // Use already created object
                    } else {
                        // Create New
                        donorId = Math.random().toString(36).substr(2, 9);
                        donorObj = {
                            id: donorId,
                            name: donorName,
                            type: 'Individual',
                            email,
                            phone,
                            address,
                            postcode,
                            communicationPreference: commPref,
                            isGiftAidActive: false // Default to false for imports unless mapped
                        };
                    }
                }
                
                // Add to upsert map (will overwrite previous entry for same ID, effectively merging last wins if duplicate rows for same donor)
                donorsToUpsert.set(donorId!, donorObj);

                newPledges.push({
                    id: Math.random().toString(36).substr(2, 9),
                    donorName,
                    donorId: donorId, // Link to the donor
                    amount,
                    fundId: selectedFundId,
                    frequency,
                    startDate: new Date().toISOString().split('T')[0],
                    status: 'Active'
                });
            }
        });

        if (donorsToUpsert.size > 0) {
            onBulkAddDonors(Array.from(donorsToUpsert.values()));
        }
        
        if (newPledges.length > 0) {
            onBulkAddPledges(newPledges);
        }
        
        setShowCsvMapper(false);
    };

    return (
        <div className="space-y-6 animate-enter max-w-6xl mx-auto pb-20">
            <header className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 font-display tracking-tight">Campaigns</h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Capital projects and pledged giving.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center gap-2 shadow-sm">
                        <Target size={14} className="text-slate-400"/>
                        <select 
                            className="text-sm font-bold text-slate-700 outline-none bg-transparent cursor-pointer min-w-[150px]"
                            value={selectedFundId}
                            onChange={(e) => setSelectedFundId(e.target.value)}
                        >
                            {funds.filter(f => f.type === 'Restricted' || f.type === 'Designated').map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 swiss-card p-8">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 font-display">{selectedFund?.name}</h3>
                            <p className="text-slate-500 text-sm mt-1 max-w-md">{selectedFund?.description}</p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-emerald-100">Active</span>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                                <span>Collection Progress</span>
                                <span>{percentComplete.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${percentComplete}%` }}></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-8 border-t border-slate-50 pt-6">
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-1">Pledged</p>
                                <p className="text-xl font-bold text-slate-900 font-mono">£{totalPledged.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-1">Collected</p>
                                <p className="text-xl font-bold text-emerald-600 font-mono">£{totalCollected.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-1">Target</p>
                                <p className="text-xl font-bold text-slate-900 font-mono">£{target.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="swiss-card p-6 flex flex-col items-center justify-center">
                    <div className="w-48 h-48">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} innerRadius={40} outerRadius={65} paddingAngle={5} dataKey="value" stroke="none">
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-4">
                        <p className="text-xs font-medium text-slate-400">Funds vs Target</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 swiss-card overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2"><Users size={16} /> Pledges</h3>
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">{campaignPledges.length}</span>
                        </div>
                        {canEdit ? (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1.5 bg-white border border-slate-200 rounded hover:border-slate-300 text-slate-600 transition-colors shadow-sm" 
                                    title="Import CSV"
                                >
                                    <FileSpreadsheet size={14} />
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        accept=".csv" 
                                        className="hidden" 
                                        onChange={handleFileUpload} 
                                    />
                                </button>
                                <button 
                                    onClick={handleAddPledgeClick}
                                    className="p-1.5 bg-slate-900 text-white border border-slate-900 rounded hover:bg-slate-800 transition-colors shadow-sm" 
                                    title="Add New Pledge"
                                >
                                    <Plus size={14} />
                                </button>
                                <button onClick={handleAIReconcile} disabled={isReconciling} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-md hover:border-indigo-200 text-xs font-bold uppercase tracking-wide transition-colors">
                                    {isReconciling ? <Wand2 size={14} className="animate-spin"/> : <Wand2 size={14} />} AI Match
                                </button>
                            </div>
                        ) : (
                             <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded text-xs font-bold text-slate-500 uppercase tracking-wide">
                                <Lock size={12} /> Read Only
                            </div>
                        )}
                    </div>
                    
                    {matches.length > 0 && canEdit && (
                        <div className="p-4 bg-indigo-50/30 border-b border-indigo-100">
                            <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                <Wand2 size={12} /> Suggested Links
                            </h4>
                            <div className="space-y-3">
                                {matches.map((m, i) => {
                                    const txn = transactions.find(t => t.id === m.transactionId);
                                    if (!txn) return null;
                                    
                                    return (
                                        <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded border border-indigo-100 shadow-sm gap-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-mono text-xs text-slate-500">{txn.date}</span>
                                                    <span className="font-medium text-slate-900 text-sm">{txn.description}</span>
                                                    <span className="font-mono text-xs font-bold text-emerald-600">£{txn.amount}</span>
                                                </div>
                                                <div className="flex gap-2 text-[10px] items-center">
                                                    <span className="text-indigo-600 font-bold uppercase">Reason:</span>
                                                    <span className="text-slate-600 italic">{m.reason}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                 <button onClick={() => handleRejectMatch(m)} className="text-[10px] border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors">
                                                    <X size={12}/> Dismiss
                                                </button>
                                                <button onClick={() => handleConfirmMatch(m)} className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors shadow-sm">
                                                    <Check size={12}/> Confirm Link
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left ledger-table">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 pl-6 text-xs text-slate-500 font-bold uppercase tracking-wide">Donor</th>
                                    <th className="px-6 py-3 text-xs text-slate-500 font-bold uppercase tracking-wide">Frequency</th>
                                    <th className="px-6 py-3 text-right text-xs text-slate-500 font-bold uppercase tracking-wide">Amount</th>
                                    <th className="px-6 py-3 text-center text-xs text-slate-500 font-bold uppercase tracking-wide">Status</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaignPledges.map((pledge) => (
                                    <tr key={pledge.id} className="hover:bg-slate-50 transition-colors group border-b border-slate-50 last:border-0">
                                        <td className="px-6 py-4 pl-6 font-medium text-slate-900 text-sm">{pledge.donorName}</td>
                                        <td className="px-6 py-4 text-slate-500 text-xs">{pledge.frequency}</td>
                                        <td className="px-6 py-4 text-emerald-600 font-mono font-bold text-right text-sm">£{pledge.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                                pledge.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                                pledge.status === 'Completed' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                'bg-slate-100 text-slate-500 border-slate-200'
                                            }`}>
                                                {pledge.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {pledge.status === 'Completed' && (
                                                    <button 
                                                        onClick={() => handleThankDonor(pledge)} 
                                                        className="flex items-center gap-1 text-[10px] font-bold uppercase bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded hover:text-emerald-600 hover:border-emerald-200 transition-colors shadow-sm"
                                                    >
                                                        <MessageSquare size={10} /> Say Thanks
                                                    </button>
                                                )}
                                                {canEdit && (
                                                    <button onClick={() => handleEditPledgeClick(pledge)} className="text-slate-300 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100">
                                                        <Edit2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {campaignPledges.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                                            No pledges recorded for this campaign yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="swiss-card p-6 h-full">
                    <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 font-display text-sm uppercase tracking-wide"><Calendar size={16} /> Campaign Timeline</h3>
                    <div className="space-y-8 pl-2">
                        {[
                            { date: 'OCT 2023', title: 'Launch', color: 'bg-emerald-500' },
                            { date: 'DEC 2023', title: 'Milestone 1', color: 'bg-indigo-500' },
                            { date: 'JUN 2024', title: 'Construction', color: 'bg-slate-300' }
                        ].map((item, i) => (
                            <div key={i} className="relative pl-6 border-l border-slate-200 last:border-0 pb-2">
                                <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${item.color} ring-4 ring-white`}></div>
                                <p className="text-[10px] font-bold text-slate-400 font-mono mb-1">{item.date}</p>
                                <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Thank You / Completion Modal */}
            {thankYouModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-slate-200 animate-enter">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50 rounded-t-lg">
                            <h3 className="font-bold text-emerald-900 text-sm uppercase tracking-wide flex items-center gap-2">
                                <Target size={16} /> Pledge Completed!
                            </h3>
                            <button onClick={() => setThankYouModal({ isOpen: false, pledge: null, text: '', isGenerating: false })} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                        </div>
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Check size={24} strokeWidth={3} />
                                </div>
                                <h2 className="text-lg font-bold text-slate-900">Thank {thankYouModal.pledge?.donorName}</h2>
                                <p className="text-sm text-slate-500">They have fulfilled their entire pledge amount.</p>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 relative">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex justify-between">
                                    <span>Draft Message</span>
                                    {thankYouModal.isGenerating && <span className="flex items-center gap-1 text-indigo-600"><Loader2 size={10} className="animate-spin"/> AI writing...</span>}
                                </label>
                                <textarea 
                                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-slate-700 resize-none h-24 p-0 leading-relaxed"
                                    value={thankYouModal.text}
                                    onChange={(e) => setThankYouModal(prev => ({ ...prev, text: e.target.value }))}
                                />
                                <button onClick={copyToClipboard} className="absolute bottom-3 right-3 text-slate-400 hover:text-slate-600" title="Copy text">
                                    <Copy size={14} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button 
                                    onClick={sendViaWhatsApp}
                                    className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-lg font-bold text-sm hover:bg-[#128C7E] transition-colors shadow-sm"
                                >
                                    <Phone size={16} /> WhatsApp
                                </button>
                                <button 
                                    className="flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition-colors shadow-sm"
                                    onClick={() => { window.location.href = `mailto:?subject=Thank You&body=${encodeURIComponent(thankYouModal.text)}`; }}
                                >
                                    <Mail size={16} /> Email
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Pledge Modal */}
            {(showAddModal || editingPledge) && canEdit && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-slate-200 animate-enter">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
                                {editingPledge ? 'Edit Pledge' : 'New Pledge'}
                            </h3>
                            <button onClick={() => { setShowAddModal(false); setEditingPledge(null); }} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                        </div>
                        <form onSubmit={handlePledgeSubmit} className="p-6 space-y-4">
                            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-xs text-indigo-900 mb-2">
                                {editingPledge ? 'Editing pledge for ' : 'Adding pledge to '} <strong>{selectedFund?.name}</strong>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Donor Name</label>
                                <input 
                                    type="text" 
                                    required
                                    value={pledgeForm.donorName || ''} 
                                    onChange={(e) => setPledgeForm({...pledgeForm, donorName: e.target.value})}
                                    className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                                    placeholder="e.g. John Doe"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
                                        <input 
                                            type="number" 
                                            required
                                            value={pledgeForm.amount || ''} 
                                            onChange={(e) => setPledgeForm({...pledgeForm, amount: parseFloat(e.target.value)})}
                                            className="w-full pl-6 p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Frequency</label>
                                    <select 
                                        value={pledgeForm.frequency} 
                                        onChange={(e) => setPledgeForm({...pledgeForm, frequency: e.target.value as any})}
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
                                        value={pledgeForm.startDate}
                                        onChange={e => setPledgeForm({...pledgeForm, startDate: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">End Date</label>
                                    <input 
                                        type="date"
                                        value={pledgeForm.endDate || ''} 
                                        onChange={e => setPledgeForm({...pledgeForm, endDate: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                    />
                                </div>
                            </div>

                            {editingPledge && (
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                                    <select 
                                        value={pledgeForm.status} 
                                        onChange={(e) => setPledgeForm({...pledgeForm, status: e.target.value as any})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                                <button type="button" onClick={() => { setShowAddModal(false); setEditingPledge(null); }} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button>
                                <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                                    {editingPledge ? <Save size={14} /> : <Plus size={14} />} 
                                    {editingPledge ? 'Save Changes' : 'Add Pledge'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CSV Import Modal */}
            {showCsvMapper && canEdit && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl animate-enter border border-slate-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                                <TableIcon size={16} /> Import Pledges & Donor Details
                            </h3>
                            <button onClick={() => setShowCsvMapper(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                             <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 mb-4 flex justify-between items-center">
                                <p className="text-xs text-indigo-900">
                                    Importing <strong>{csvRows.length}</strong> pledges into <strong>{selectedFund?.name}</strong>.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Donor Name *</label>
                                    <select 
                                        value={columnMapping.donor} 
                                        onChange={(e) => setColumnMapping({...columnMapping, donor: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Amount *</label>
                                    <select 
                                        value={columnMapping.amount} 
                                        onChange={(e) => setColumnMapping({...columnMapping, amount: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Frequency</label>
                                    <select 
                                        value={columnMapping.frequency} 
                                        onChange={(e) => setColumnMapping({...columnMapping, frequency: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Email</label>
                                    <select 
                                        value={columnMapping.email} 
                                        onChange={(e) => setColumnMapping({...columnMapping, email: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Phone</label>
                                    <select 
                                        value={columnMapping.phone} 
                                        onChange={(e) => setColumnMapping({...columnMapping, phone: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Address</label>
                                    <select 
                                        value={columnMapping.address} 
                                        onChange={(e) => setColumnMapping({...columnMapping, address: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Postcode</label>
                                    <select 
                                        value={columnMapping.postcode} 
                                        onChange={(e) => setColumnMapping({...columnMapping, postcode: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Comm Pref</label>
                                    <select 
                                        value={columnMapping.commPref} 
                                        onChange={(e) => setColumnMapping({...columnMapping, commPref: e.target.value})}
                                        className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>

                             <div className="mt-4">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Preview (First 3 Rows)</label>
                                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                                    <table className="w-full text-left ledger-table text-[10px]">
                                        <thead className="bg-slate-50">
                                            <tr>{csvHeaders.map(h => <th key={h} className="px-3 py-2 text-slate-500 font-bold whitespace-nowrap">{h}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {csvRows.slice(0, 3).map((row, i) => (
                                                <tr key={i} className="border-b border-slate-50 last:border-0">
                                                    {row.map((cell, j) => <td key={j} className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{cell}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                                <button onClick={() => setShowCsvMapper(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button>
                                <button onClick={handleProcessImport} className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                                    Import Data <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Campaigns;