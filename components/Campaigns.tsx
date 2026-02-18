import React, { useState, useRef, useEffect } from 'react';
import { AppUser, Donor, DonorCreateInput, Fund, FundType, Pledge, PledgeCreateInput, Transaction } from '../types';
import { useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Upload, Users, Calendar, Wand2, Check, X, Lock, Plus, FileSpreadsheet, ArrowRight, Table as TableIcon, Edit2, Target, Save, MessageSquare, Phone, Mail, Loader2, Copy, Search } from 'lucide-react';
import { notify } from '../lib/notifications';

interface CampaignsProps {
    funds: Fund[];
    pledges: Pledge[];
    transactions: Transaction[];
    donors: Donor[];
    onAddPledge: (p: PledgeCreateInput) => void;
    onUpdatePledge: (p: Pledge) => void;
    onBulkAddPledges: (ps: PledgeCreateInput[]) => void;
    onBulkAddDonors: (ds: DonorCreateInput[]) => Promise<{ id: string; name: string; isNew: boolean }[]>;
    onUpdateTransaction: (t: Transaction) => void;
    currentUser: AppUser;
    onPledgeCompleted?: (donorName: string, amount: number) => void;
}

const COLORS = ['#6B8068', '#E5E0D8'];

const Campaigns: React.FC<CampaignsProps> = ({ funds, pledges, transactions, donors, onAddPledge, onUpdatePledge, onBulkAddPledges, onBulkAddDonors, onUpdateTransaction, currentUser, onPledgeCompleted }) => {
    // Only show Restricted (campaign) funds
    const campaignFunds = funds.filter(f => f.type === FundType.RESTRICTED);
    const [selectedFundId, setSelectedFundId] = useState<string>('');
    const [isReconciling, setIsReconciling] = useState(false);
    const reconcilePledgesAction = useAction(api.actions.ai.reconcilePledges);
    const generatePledgeCompletionMessageAction = useAction(api.actions.ai.generatePledgeCompletionMessage);

    // Set default selected fund when campaign funds are available
    useEffect(() => {
        if (campaignFunds.length > 0 && !selectedFundId) {
            setSelectedFundId(campaignFunds[0]._id);
        }
    }, [campaignFunds, selectedFundId]);
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

    // Import feedback state
    const [importResult, setImportResult] = useState<{
        show: boolean;
        totalRows: number;
        importedPledges: number;
        importedDonors: number;
        newDonors: number;
        skippedRows: { row: number; reason: string }[];
    } | null>(null);

    const canEdit = ['Admin', 'Finance Team'].includes(currentUser.role);
    const [pledgeSearch, setPledgeSearch] = useState('');

    // Show empty state if no campaign funds exist
    if (campaignFunds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-grey-mid animate-enter">
                <div className="w-16 h-16 bg-grey-light rounded-2xl flex items-center justify-center mb-6 text-ledger">
                    <Target size={32} />
                </div>
                <h2 className="text-lg font-bold text-ink font-mono mb-2">No Campaigns Yet</h2>
                <p className="text-sm max-w-sm text-center mb-4">Create a Restricted fund in Settings to start tracking campaign pledges and donations.</p>
                <p className="text-xs text-grey-mid">Go to Settings → Funds & Campaigns → Add Fund (Type: Restricted)</p>
            </div>
        );
    }

    // Get the selected fund, falling back to the first campaign fund if selectedFundId is not set or invalid
    const selectedFund = campaignFunds.find(f => f._id === selectedFundId) || campaignFunds[0];
    const currentFundId = selectedFund._id;
    const campaignPledges = pledges.filter(p => p.fundId === currentFundId);
    const filteredPledges = campaignPledges.filter(p =>
        pledgeSearch === '' || p.donorName.toLowerCase().includes(pledgeSearch.toLowerCase())
    );

    const totalPledged = campaignPledges.reduce((acc, p) => acc + p.amount, 0);
    const totalCollected = transactions.filter(t => t.fundId === currentFundId && t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const target = selectedFund.targetAmount || totalPledged * 1.2;
    const percentComplete = Math.min((totalCollected / target) * 100, 100);

    const pieData = [{ name: 'Collected', value: totalCollected }, { name: 'Remaining', value: Math.max(0, target - totalCollected) }];

    // --- Actions ---

    const handleAIReconcile = async () => {
        setIsReconciling(true);
        try {
            const results = await reconcilePledgesAction({});
            setMatches(results);
        } catch (e) { console.error(e); } finally { setIsReconciling(false); }
    };

    const handleConfirmMatch = (match: any) => {
        const t = transactions.find(tr => tr._id === match.transactionId);
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
            const fundName = funds.find(f => f._id === pledge.fundId)?.name || 'Campaign';
            const text = await generatePledgeCompletionMessageAction({
                donorName: pledge.donorName,
                pledgeAmount: pledge.amount,
                fundName
            });
            setThankYouModal(prev => ({ ...prev, text: text || "Thank you for your generous support!", isGenerating: false }));
        } catch (e) {
            setThankYouModal(prev => ({ ...prev, text: "Error generating message.", isGenerating: false }));
        }
    };

    const sendViaWhatsApp = () => {
        if (!thankYouModal.pledge) return;
        const donor = donors.find(d => d._id === thankYouModal.pledge?.donorId);
        if (donor && donor.phone) {
            const cleanPhone = donor.phone.replace(/[^0-9]/g, '');
            // Simple robust check for UK international format
            const formatted = cleanPhone.startsWith('0') ? '44' + cleanPhone.substring(1) : cleanPhone;
            const url = `https://wa.me/${formatted}?text=${encodeURIComponent(thankYouModal.text)}`;
            window.open(url, '_blank');
        } else {
            notify("Notice", "No phone number found for this donor.");
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(thankYouModal.text);
        notify("Copied", "Message copied to clipboard.");
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
            
            const pledge: PledgeCreateInput = {
                donorName: pledgeForm.donorName,
                donorId: existingDonor?._id,
                amount: Number(pledgeForm.amount),
                fundId: currentFundId,
                frequency: (pledgeForm.frequency as PledgeCreateInput["frequency"]) || 'Monthly',
                startDate: pledgeForm.startDate || new Date().toISOString().split('T')[0],
                endDate: pledgeForm.endDate,
                status: (pledgeForm.status as PledgeCreateInput["status"]) || 'Active'
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
            if (lines.length < 2) {
                notify("Error", "Invalid CSV.");
                return;
            }

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

    const handleProcessImport = async () => {
        const donorIdx = csvHeaders.indexOf(columnMapping.donor);
        const amountIdx = csvHeaders.indexOf(columnMapping.amount);
        const freqIdx = csvHeaders.indexOf(columnMapping.frequency);

        // Optional indices
        const emailIdx = csvHeaders.indexOf(columnMapping.email);
        const phoneIdx = csvHeaders.indexOf(columnMapping.phone);
        const addressIdx = csvHeaders.indexOf(columnMapping.address);
        const postcodeIdx = csvHeaders.indexOf(columnMapping.postcode);
        const commPrefIdx = csvHeaders.indexOf(columnMapping.commPref);

        // Only donor name is required - amount is optional for outreach-only imports
        if (donorIdx === -1) {
            notify("Error", "Donor Name column is required.");
            return;
        }

        const newPledges: PledgeCreateInput[] = [];
        const donorsToUpsert = new Map<string, DonorCreateInput>(); // Key by ID
        const skippedRows: { row: number; reason: string }[] = [];
        const createdPledgeKeys = new Set<string>(); // Track pledges in this batch for duplicate detection

        csvRows.forEach((row, rowIndex) => {
            const donorName = row[donorIdx]?.trim();

            // Skip rows with empty donor name
            if (!donorName) {
                skippedRows.push({ row: rowIndex + 2, reason: 'Empty donor name' }); // +2 for header row and 1-based
                return;
            }

            // Parse amount - default to 0 if not provided or invalid
            let amount = 0;
            if (amountIdx !== -1) {
                let amountStr = row[amountIdx] || '0';
                amountStr = amountStr.replace(/[£$,]/g, '');
                const parsed = parseFloat(amountStr);
                amount = isNaN(parsed) ? 0 : parsed;
            }

            const freqRaw = freqIdx !== -1 ? row[freqIdx] : 'One-off';

            // Normalize frequency
            let frequency: any = 'One-off';
            if (freqRaw && freqRaw.toLowerCase().includes('month')) frequency = 'Monthly';
            else if (freqRaw && freqRaw.toLowerCase().includes('week')) frequency = 'Weekly';
            else if (freqRaw && (freqRaw.toLowerCase().includes('year') || freqRaw.toLowerCase().includes('ann'))) frequency = 'Annual';

            // Check if donor exists in current database OR in the upsert map we are building
            const existingDonor = donors.find(d => d.name.toLowerCase() === donorName.toLowerCase());

            // --- DUPLICATE PLEDGE DETECTION ---
            // Check against existing pledges in database (by donorId or donorName + fundId + amount)
            const existingDuplicate = pledges.find(p => {
                if (existingDonor && p.donorId === existingDonor._id) {
                    return p.fundId === currentFundId && p.amount === amount;
                }
                if (!existingDonor && p.donorName.toLowerCase() === donorName.toLowerCase()) {
                    return p.fundId === currentFundId && p.amount === amount;
                }
                return false;
            });

            if (existingDuplicate) {
                skippedRows.push({ row: rowIndex + 2, reason: `Duplicate pledge exists (${donorName}, £${amount})` });
                return;
            }

            // Check for duplicates within this import batch
            const batchKey = `${donorName.toLowerCase()}|${currentFundId}|${amount}`;
            if (createdPledgeKeys.has(batchKey)) {
                skippedRows.push({ row: rowIndex + 2, reason: `Duplicate in CSV batch (${donorName}, £${amount})` });
                return;
            }
            createdPledgeKeys.add(batchKey);

            // Only use Convex _id for existing donors, undefined for new donors
            let convexDonorId: string | undefined = existingDonor?._id;
            let localDonorKey: string; // Key for the local upsert map
            let donorObj: DonorCreateInput;

            // Extract optional details
            const email = emailIdx !== -1 ? row[emailIdx] : undefined;
            const phone = phoneIdx !== -1 ? row[phoneIdx] : undefined;
            const address = addressIdx !== -1 ? row[addressIdx] : undefined;
            const postcode = postcodeIdx !== -1 ? row[postcodeIdx] : undefined;
            const commPrefRaw = commPrefIdx !== -1 ? row[commPrefIdx] : undefined;

            let commPref: 'Email' | 'Post' | 'Phone' | undefined;
            if (commPrefRaw) {
                const c = commPrefRaw.toLowerCase();
                if (c.includes('email')) commPref = 'Email';
                else if (c.includes('post') || c.includes('mail')) commPref = 'Post';
                else if (c.includes('phone')) commPref = 'Phone';
            }

            if (existingDonor) {
                convexDonorId = existingDonor._id;
                localDonorKey = existingDonor._id;
                // Update existing with new info if present
                donorObj = {
                    name: existingDonor.name,
                    type: existingDonor.type,
                    email: email || existingDonor.email,
                    phone: phone || existingDonor.phone,
                    address: address || existingDonor.address,
                    postcode: postcode || existingDonor.postcode,
                    communicationPreference: commPref || existingDonor.communicationPreference
                };
            } else {
                // Check if we already created a donor for this name in this batch
                const foundInBatch = Array.from(donorsToUpsert.entries()).find(([, d]) => d.name.toLowerCase() === donorName.toLowerCase());
                if (foundInBatch) {
                    // Use existing batch entry, but don't set convexDonorId (it's a new donor)
                    localDonorKey = foundInBatch[0];
                    donorObj = {
                        ...foundInBatch[1],
                        email: email || foundInBatch[1].email,
                        phone: phone || foundInBatch[1].phone,
                        address: address || foundInBatch[1].address,
                        postcode: postcode || foundInBatch[1].postcode,
                        communicationPreference: commPref || foundInBatch[1].communicationPreference,
                    };
                } else {
                    // Create New - generate temp ID for local tracking only
                    localDonorKey = Math.random().toString(36).substr(2, 9);
                    donorObj = {
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
                // New donors don't have a valid Convex ID yet
                convexDonorId = undefined;
            }

            // Add to upsert map (will overwrite previous entry for same ID, effectively merging last wins if duplicate rows for same donor)
            donorsToUpsert.set(localDonorKey, donorObj);

            newPledges.push({
                donorName,
                donorId: convexDonorId, // Only set for existing donors with valid Convex ID
                amount,
                fundId: currentFundId,
                frequency,
                startDate: new Date().toISOString().split('T')[0],
                status: 'Active'
            });
        });

        // First, create/update donors and get their real Convex IDs
        let donorIdMap = new Map<string, string>(); // Map donor name to Convex ID
        let newDonorCount = 0;

        if (donorsToUpsert.size > 0) {
            const donorResults = await onBulkAddDonors(Array.from(donorsToUpsert.values()));
            // Build a map of donor name -> Convex ID
            for (const result of donorResults) {
                donorIdMap.set(result.name.toLowerCase(), result.id);
                if (result.isNew) newDonorCount++;
            }
        }

        // Now update pledges with real donor IDs and create them
        if (newPledges.length > 0) {
            const linkedPledges = newPledges.map(pledge => ({
                ...pledge,
                donorId: donorIdMap.get(pledge.donorName.toLowerCase()) || pledge.donorId
            }));
            onBulkAddPledges(linkedPledges);
        }

        // Show import results
        setImportResult({
            show: true,
            totalRows: csvRows.length,
            importedPledges: newPledges.length,
            importedDonors: donorsToUpsert.size,
            newDonors: newDonorCount,
            skippedRows
        });

        setShowCsvMapper(false);
    };

    return (
        <>
        <div className="space-y-6 animate-enter max-w-6xl mx-auto pb-20">
            <header className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-ledger pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-ink font-mono tracking-tight">Campaigns</h2>
                    <p className="text-grey-mid mt-1 text-sm font-medium">Capital projects and pledged giving.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-white border border-ledger rounded-md px-3 py-2 flex items-center gap-2 shadow-sm">
                        <Target size={14} className="text-grey-mid"/>
                        <select
                            className="text-sm font-bold text-grey-dark outline-none bg-transparent cursor-pointer min-w-[150px]"
                            value={currentFundId}
                            onChange={(e) => setSelectedFundId(e.target.value)}
                        >
                            {campaignFunds.map(f => (
                                <option key={f._id} value={f._id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 swiss-card p-6 md:p-8">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-2xl font-bold text-ink font-mono">{selectedFund?.name}</h3>
                            <p className="text-grey-mid text-sm mt-1 max-w-md">{selectedFund?.description}</p>
                        </div>
                        <span className="bg-sage-light text-sage-dark px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-sage/30">Active</span>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-grey-mid mb-2 uppercase tracking-wide">
                                <span>Collection Progress</span>
                                <span>{percentComplete.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-2 bg-grey-light rounded-full overflow-hidden">
                                <div className="h-full bg-sage-light0 rounded-full transition-all duration-1000 ease-out" style={{ width: `${percentComplete}%` }}></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 border-t border-grey-light pt-6">
                            <div>
                                <p className="text-[10px] text-grey-mid font-bold uppercase tracking-wide mb-1">Pledged</p>
                                <p className="text-xl font-bold text-ink font-mono">£{totalPledged.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-grey-mid font-bold uppercase tracking-wide mb-1">Collected</p>
                                <p className="text-xl font-bold text-sage font-mono">£{totalCollected.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-grey-mid font-bold uppercase tracking-wide mb-1">Target</p>
                                <p className="text-xl font-bold text-ink font-mono">£{target.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="swiss-card p-6 flex flex-col items-center justify-center">
                    <div className="w-32 h-32 sm:w-48 sm:h-48">
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
                        <p className="text-xs font-medium text-grey-mid">Funds vs Target</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 swiss-card overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-ledger flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-paper/50">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold text-ink text-sm uppercase tracking-wide flex items-center gap-2"><Users size={16} /> Pledges</h3>
                                <span className="text-[10px] bg-ledger text-grey-dark px-1.5 py-0.5 rounded font-mono font-bold">{campaignPledges.length}</span>
                            </div>
                            <div className="relative w-full sm:w-auto">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-grey-mid" />
                                <input
                                    type="text"
                                    placeholder="Search donors..."
                                    value={pledgeSearch}
                                    onChange={(e) => setPledgeSearch(e.target.value)}
                                    className="pl-8 pr-3 py-1.5 text-xs border border-ledger rounded-md bg-white focus:ring-1 focus:ring-ink outline-none w-full sm:w-40"
                                />
                            </div>
                        </div>
                        {canEdit ? (
                            <div className="flex gap-2 w-full md:w-auto justify-end">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-1.5 bg-white border border-ledger rounded hover:border-grey-mid text-grey-dark transition-colors shadow-sm"
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
                                    className="p-1.5 bg-ink text-white border border-ink rounded hover:bg-charcoal transition-colors shadow-sm"
                                    title="Add New Pledge"
                                >
                                    <Plus size={14} />
                                </button>
                                <button onClick={handleAIReconcile} disabled={isReconciling} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-ledger text-sage rounded-md hover:border-sage/30 text-xs font-bold uppercase tracking-wide transition-colors">
                                    {isReconciling ? <Wand2 size={14} className="animate-spin"/> : <Wand2 size={14} />} <span className="hidden sm:inline">AI Match</span>
                                </button>
                            </div>
                        ) : (
                             <div className="flex items-center gap-2 px-3 py-1 bg-grey-light rounded text-xs font-bold text-grey-mid uppercase tracking-wide">
                                <Lock size={12} /> Read Only
                            </div>
                        )}
                    </div>
                    
                    {matches.length > 0 && canEdit && (
                        <div className="p-4 bg-sage-light/30 border-b border-sage/30">
                            <h4 className="text-xs font-bold text-sage-dark uppercase tracking-wide mb-3 flex items-center gap-2">
                                <Wand2 size={12} /> Suggested Links
                            </h4>
                            <div className="space-y-3">
                                {matches.map((m, i) => {
                                    const txn = transactions.find(t => t._id === m.transactionId);
                                    if (!txn) return <div key={i} style={{display: 'none'}} />;

                                    return (
                                        <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded border border-sage/30 shadow-sm gap-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-mono text-xs text-grey-mid">{txn.date}</span>
                                                    <span className="font-medium text-ink text-sm">{txn.description}</span>
                                                    <span className="font-mono text-xs font-bold text-sage">£{txn.amount}</span>
                                                </div>
                                                <div className="flex gap-2 text-[10px] items-center">
                                                    <span className="text-sage font-bold uppercase">Reason:</span>
                                                    <span className="text-grey-dark italic">{m.reason}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                 <button onClick={() => handleRejectMatch(m)} className="text-[10px] border border-ledger text-grey-mid hover:text-error hover:border-error/30 px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors">
                                                    <X size={12}/> Dismiss
                                                </button>
                                                <button onClick={() => handleConfirmMatch(m)} className="text-[10px] bg-sage hover:bg-sage-dark text-white px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors shadow-sm">
                                                    <Check size={12}/> Confirm Link
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Mobile Cards View */}
                    <div className="md:hidden flex-1 overflow-y-auto p-4 space-y-3">
                        {filteredPledges.map((pledge) => (
                            <div key={pledge._id} className="bg-white p-4 rounded-lg border border-ledger">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-bold text-ink text-sm">{pledge.donorName}</div>
                                        <div className="text-xs text-grey-mid">{pledge.frequency}</div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                        pledge.status === 'Active' ? 'bg-sage-light text-sage-dark border-sage/30' :
                                        pledge.status === 'Completed' ? 'bg-sage-light text-sage-dark border-sage/30' :
                                        'bg-grey-light text-grey-mid border-ledger'
                                    }`}>
                                        {pledge.status}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-grey-light">
                                    <span className="text-sage font-mono font-bold text-lg">£{pledge.amount.toLocaleString()}</span>
                                    <div className="flex gap-2">
                                        {pledge.status === 'Completed' && (
                                            <button
                                                onClick={() => handleThankDonor(pledge)}
                                                className="flex items-center gap-1 text-[10px] font-bold uppercase bg-white border border-ledger text-grey-dark px-3 py-1.5 rounded hover:text-sage hover:border-sage/30 transition-colors shadow-sm"
                                            >
                                                <MessageSquare size={12} /> Thanks
                                            </button>
                                        )}
                                        {canEdit && (
                                            <button onClick={() => handleEditPledgeClick(pledge)} className="p-2 text-grey-mid hover:text-grey-dark hover:bg-grey-light rounded transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredPledges.length === 0 && (
                            <div className="py-12 text-center text-grey-mid text-sm">
                                {pledgeSearch ? `No pledges matching "${pledgeSearch}"` : 'No pledges recorded for this campaign yet.'}
                            </div>
                        )}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto flex-1">
                        <table className="w-full text-left ledger-table">
                            <thead className="bg-paper border-b border-ledger">
                                <tr>
                                    <th className="px-6 py-3 pl-6 text-xs text-grey-mid font-bold uppercase tracking-wide">Donor</th>
                                    <th className="px-6 py-3 text-xs text-grey-mid font-bold uppercase tracking-wide">Frequency</th>
                                    <th className="px-6 py-3 text-right text-xs text-grey-mid font-bold uppercase tracking-wide">Amount</th>
                                    <th className="px-6 py-3 text-center text-xs text-grey-mid font-bold uppercase tracking-wide">Status</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPledges.map((pledge) => (
                                    <tr key={pledge._id} className="hover:bg-paper transition-colors group border-b border-grey-light last:border-0">
                                        <td className="px-6 py-4 pl-6 font-medium text-ink text-sm">{pledge.donorName}</td>
                                        <td className="px-6 py-4 text-grey-mid text-xs">{pledge.frequency}</td>
                                        <td className="px-6 py-4 text-sage font-mono font-bold text-right text-sm">£{pledge.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                                pledge.status === 'Active' ? 'bg-sage-light text-sage-dark border-sage/30' :
                                                pledge.status === 'Completed' ? 'bg-sage-light text-sage-dark border-sage/30' :
                                                'bg-grey-light text-grey-mid border-ledger'
                                            }`}>
                                                {pledge.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {pledge.status === 'Completed' && (
                                                    <button
                                                        onClick={() => handleThankDonor(pledge)}
                                                        className="flex items-center gap-1 text-[10px] font-bold uppercase bg-white border border-ledger text-grey-dark px-2 py-1 rounded hover:text-sage hover:border-sage/30 transition-colors shadow-sm"
                                                    >
                                                        <MessageSquare size={10} /> Say Thanks
                                                    </button>
                                                )}
                                                {canEdit && (
                                                    <button onClick={() => handleEditPledgeClick(pledge)} className="text-ledger hover:text-grey-dark transition-colors md:opacity-0 md:group-hover:opacity-100">
                                                        <Edit2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPledges.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-grey-mid text-sm">
                                            {pledgeSearch ? `No pledges matching "${pledgeSearch}"` : 'No pledges recorded for this campaign yet.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="swiss-card p-6 h-full">
                    <h3 className="font-bold text-ink mb-6 flex items-center gap-2 font-mono text-sm uppercase tracking-wide"><Calendar size={16} /> Campaign Timeline</h3>
                    <div className="space-y-8 pl-2">
                        {[
                            { date: 'OCT 2023', title: 'Launch', color: 'bg-sage-light0' },
                            { date: 'DEC 2023', title: 'Milestone 1', color: 'bg-sage-light0' },
                            { date: 'JUN 2024', title: 'Construction', color: 'bg-grey-mid' }
                        ].map((item, i) => (
                            <div key={i} className="relative pl-6 border-l border-ledger last:border-0 pb-2">
                                <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${item.color} ring-4 ring-white`}></div>
                                <p className="text-[10px] font-bold text-grey-mid font-mono mb-1">{item.date}</p>
                                <h4 className="font-bold text-ink text-sm">{item.title}</h4>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

            {/* Thank You / Completion Modal */}
            {thankYouModal.isOpen && (
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-ledger animate-enter">
                        <div className="p-4 border-b border-ledger flex justify-between items-center bg-sage-light rounded-t-lg">
                            <h3 className="font-bold text-sage-dark text-sm uppercase tracking-wide flex items-center gap-2">
                                <Target size={16} /> Pledge Completed!
                            </h3>
                            <button onClick={() => setThankYouModal({ isOpen: false, pledge: null, text: '', isGenerating: false })} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button>
                        </div>
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="w-12 h-12 bg-sage-light text-sage rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Check size={24} strokeWidth={3} />
                                </div>
                                <h2 className="text-lg font-bold text-ink">Thank {thankYouModal.pledge?.donorName}</h2>
                                <p className="text-sm text-grey-mid">They have fulfilled their entire pledge amount.</p>
                            </div>

                            <div className="bg-paper p-4 rounded-lg border border-ledger relative">
                                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2 flex justify-between">
                                    <span>Draft Message</span>
                                    {thankYouModal.isGenerating && <span className="flex items-center gap-1 text-sage"><Loader2 size={10} className="animate-spin"/> AI writing...</span>}
                                </label>
                                <textarea 
                                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-grey-dark resize-none h-24 p-0 leading-relaxed"
                                    value={thankYouModal.text}
                                    onChange={(e) => setThankYouModal(prev => ({ ...prev, text: e.target.value }))}
                                />
                                <button onClick={copyToClipboard} className="absolute bottom-3 right-3 text-grey-mid hover:text-grey-dark" title="Copy text">
                                    <Copy size={14} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                                <button
                                    onClick={sendViaWhatsApp}
                                    className="flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-lg font-bold text-sm hover:bg-[#128C7E] transition-colors shadow-sm"
                                >
                                    <Phone size={16} /> WhatsApp
                                </button>
                                <button 
                                    className="flex items-center justify-center gap-2 py-2.5 bg-ink text-white rounded-lg font-bold text-sm hover:bg-charcoal transition-colors shadow-sm"
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
                <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-start md:items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-ledger animate-enter my-4 md:my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
                        <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
                            <h3 className="font-bold text-ink text-sm uppercase tracking-wide">
                                {editingPledge ? 'Edit Pledge' : 'New Pledge'}
                            </h3>
                            <button onClick={() => { setShowAddModal(false); setEditingPledge(null); }} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button>
                        </div>
                        <form onSubmit={handlePledgeSubmit} className="p-6 space-y-4">
                            <div className="bg-sage-light p-3 rounded-lg border border-sage/30 text-xs text-sage-dark mb-2">
                                {editingPledge ? 'Editing pledge for ' : 'Adding pledge to '} <strong>{selectedFund?.name}</strong>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Donor Name</label>
                                <input 
                                    type="text" 
                                    required
                                    value={pledgeForm.donorName || ''} 
                                    onChange={(e) => setPledgeForm({...pledgeForm, donorName: e.target.value})}
                                    className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"
                                    placeholder="e.g. John Doe"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid text-xs">£</span>
                                        <input 
                                            type="number" 
                                            required
                                            value={pledgeForm.amount || ''} 
                                            onChange={(e) => setPledgeForm({...pledgeForm, amount: parseFloat(e.target.value)})}
                                            className="w-full pl-6 p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Frequency</label>
                                    <select 
                                        value={pledgeForm.frequency} 
                                        onChange={(e) => setPledgeForm({...pledgeForm, frequency: e.target.value as any})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="One-off">One-off</option>
                                        <option value="Weekly">Weekly</option>
                                        <option value="Monthly">Monthly</option>
                                        <option value="Annual">Annual</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Start Date</label>
                                    <input 
                                        type="date"
                                        value={pledgeForm.startDate}
                                        onChange={e => setPledgeForm({...pledgeForm, startDate: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">End Date</label>
                                    <input 
                                        type="date"
                                        value={pledgeForm.endDate || ''} 
                                        onChange={e => setPledgeForm({...pledgeForm, endDate: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"
                                    />
                                </div>
                            </div>

                            {editingPledge && (
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Status</label>
                                    <select 
                                        value={pledgeForm.status} 
                                        onChange={(e) => setPledgeForm({...pledgeForm, status: e.target.value as any})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-ledger mt-4">
                                <button type="button" onClick={() => { setShowAddModal(false); setEditingPledge(null); }} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">Cancel</button>
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
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl animate-enter border border-ledger">
                        <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
                            <h3 className="font-bold text-ink text-sm uppercase tracking-wide flex items-center gap-2">
                                <TableIcon size={16} /> Import Pledges & Donor Details
                            </h3>
                            <button onClick={() => setShowCsvMapper(false)} className="text-grey-mid hover:text-grey-dark">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="bg-sage-light p-4 rounded-lg border border-sage/30 mb-4 flex justify-between items-center">
                                <p className="text-xs text-sage-dark">
                                    <strong>{csvRows.length}</strong> rows found • Importing into <strong>{selectedFund?.name}</strong>
                                </p>
                                <p className="text-[10px] text-sage-dark/70">
                                    Donors with same name will be merged
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Donor Name *</label>
                                    <select 
                                        value={columnMapping.donor} 
                                        onChange={(e) => setColumnMapping({...columnMapping, donor: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Amount</label>
                                    <select
                                        value={columnMapping.amount}
                                        onChange={(e) => setColumnMapping({...columnMapping, amount: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Frequency</label>
                                    <select 
                                        value={columnMapping.frequency} 
                                        onChange={(e) => setColumnMapping({...columnMapping, frequency: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Email</label>
                                    <select 
                                        value={columnMapping.email} 
                                        onChange={(e) => setColumnMapping({...columnMapping, email: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Phone</label>
                                    <select 
                                        value={columnMapping.phone} 
                                        onChange={(e) => setColumnMapping({...columnMapping, phone: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Address</label>
                                    <select 
                                        value={columnMapping.address} 
                                        onChange={(e) => setColumnMapping({...columnMapping, address: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Postcode</label>
                                    <select 
                                        value={columnMapping.postcode} 
                                        onChange={(e) => setColumnMapping({...columnMapping, postcode: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Comm Pref</label>
                                    <select 
                                        value={columnMapping.commPref} 
                                        onChange={(e) => setColumnMapping({...columnMapping, commPref: e.target.value})}
                                        className="w-full p-2.5 border border-ledger rounded text-sm bg-white focus:ring-1 focus:ring-ink outline-none"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>

                             <div className="mt-4">
                                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">Preview (First 3 Rows)</label>
                                <div className="overflow-x-auto border border-ledger rounded-lg">
                                    <table className="w-full text-left ledger-table text-[10px]">
                                        <thead className="bg-paper">
                                            <tr>{csvHeaders.map(h => <th key={h} className="px-3 py-2 text-grey-mid font-bold whitespace-nowrap">{h}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {csvRows.slice(0, 3).map((row, i) => (
                                                <tr key={i} className="border-b border-grey-light last:border-0">
                                                    {row.map((cell, j) => <td key={j} className="px-3 py-2 font-mono text-grey-dark whitespace-nowrap">{cell}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-ledger mt-4">
                                <button onClick={() => setShowCsvMapper(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">Cancel</button>
                                <button onClick={handleProcessImport} className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                                    Import Data <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Results Modal */}
            {importResult?.show && (
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md animate-enter border border-ledger">
                        <div className="p-4 border-b border-ledger flex justify-between items-center bg-sage-light rounded-t-lg">
                            <h3 className="font-bold text-sage-dark text-sm uppercase tracking-wide flex items-center gap-2">
                                <Check size={16} /> Import Complete
                            </h3>
                            <button onClick={() => setImportResult(null)} className="text-grey-mid hover:text-grey-dark">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-paper p-3 rounded-lg border border-ledger text-center">
                                    <div className="text-2xl font-bold text-ink font-mono">{importResult.importedPledges}</div>
                                    <div className="text-[10px] font-bold text-grey-mid uppercase tracking-wide">Pledges Imported</div>
                                </div>
                                <div className="bg-paper p-3 rounded-lg border border-ledger text-center">
                                    <div className="text-2xl font-bold text-ink font-mono">{importResult.importedDonors}</div>
                                    <div className="text-[10px] font-bold text-grey-mid uppercase tracking-wide">Unique Donors</div>
                                </div>
                                <div className="bg-sage-light p-3 rounded-lg border border-sage/30 text-center">
                                    <div className="text-2xl font-bold text-sage-dark font-mono">{importResult.newDonors}</div>
                                    <div className="text-[10px] font-bold text-sage-dark uppercase tracking-wide">New Donors</div>
                                </div>
                                <div className="bg-paper p-3 rounded-lg border border-ledger text-center">
                                    <div className="text-2xl font-bold text-grey-mid font-mono">{importResult.importedDonors - importResult.newDonors}</div>
                                    <div className="text-[10px] font-bold text-grey-mid uppercase tracking-wide">Existing Updated</div>
                                </div>
                            </div>

                            {/* Skipped Rows */}
                            {importResult.skippedRows.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">
                                        {importResult.skippedRows.length} Rows Skipped
                                    </div>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {importResult.skippedRows.slice(0, 10).map((skip, i) => (
                                            <div key={i} className="text-xs text-amber-700">
                                                Row {skip.row}: {skip.reason}
                                            </div>
                                        ))}
                                        {importResult.skippedRows.length > 10 && (
                                            <div className="text-xs text-amber-600 italic">
                                                ...and {importResult.skippedRows.length - 10} more
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Total processed info */}
                            <div className="text-xs text-grey-mid text-center pt-2 border-t border-ledger">
                                Processed {importResult.totalRows} total rows from CSV
                            </div>

                            <div className="flex justify-center pt-2">
                                <button
                                    onClick={() => setImportResult(null)}
                                    className="btn-primary px-6 py-2 font-bold uppercase text-xs tracking-wide"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Campaigns;
