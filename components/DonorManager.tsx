import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Donor, DonorCreateInput, Transaction, Pledge, PledgeCreateInput, Fund, TransactionType, AppUser, ChurchDetails } from '../types';
import { generateScheduleHTML } from '../services/pdfGenerator';
import { Plus, User, Calendar, Mail, Phone, MapPin, Gift, Search, History, Wallet, Edit2, X, Save, Link as LinkIcon, Unlink, FileText, Printer, ShieldAlert, LayoutDashboard, UserCog, MessageSquare, CheckCircle2, Copy, Send, Heart, Clock, PartyPopper, Info, CalendarCheck, Users, Merge, Check } from 'lucide-react';

// WhatsApp message template types
type TemplateType = 'newPledge' | 'pledgeChaser' | 'pledgeFulfillment' | 'generalUpdate' | 'endOfYear';

interface MessageTemplate {
  name: string;
  description: string;
  template: string;
  requiresPledge: boolean;
}

const MESSAGE_TEMPLATES: Record<TemplateType, MessageTemplate> = {
  newPledge: {
    name: 'New Pledge',
    description: 'Thank you for signing up',
    template: `Hi {donorName}, thank you for committing to support our church with your pledge of £{pledgeAmount} ({frequency}) towards {fundName}. Your generosity makes a real difference. We look forward to partnering with you on this journey. God bless!

— NCC Finance Team`,
    requiresPledge: true
  },
  pledgeChaser: {
    name: 'Pledge Reminder',
    description: 'Gentle reminder to start giving',
    template: `Hi {donorName}, we hope you're doing well! This is a gentle reminder about your pledge of £{pledgeAmount} ({frequency}) towards {fundName}. When you're ready, your contribution will help us continue our mission. Every gift matters. Thank you for your commitment!

— NCC Finance Team`,
    requiresPledge: true
  },
  pledgeFulfillment: {
    name: 'Pledge Complete',
    description: 'Thank you for fulfilling pledge',
    template: `Hi {donorName}, amazing news! You've completed your pledge of £{pledgeAmount} towards {fundName}. Thank you for your faithful giving - it's made a real impact. If you'd like to continue supporting this cause or explore other giving opportunities, we'd love to hear from you.

— NCC Finance Team`,
    requiresPledge: true
  },
  generalUpdate: {
    name: 'General Update',
    description: 'General appreciation message',
    template: `Hi {donorName}, thank you for being part of our church community. Your faithful giving towards {fundName} has helped us serve and grow. We're grateful for your ongoing support and partnership in our mission.

— NCC Finance Team`,
    requiresPledge: false
  },
  endOfYear: {
    name: 'End of Year',
    description: 'Annual giving summary',
    template: `Hi {donorName}, as we reflect on the past year, we want to thank you for your generosity. Your total giving of £{yearTotal} towards {fundName} has made a meaningful difference in our community. Wishing you a blessed year ahead!

— NCC Finance Team`,
    requiresPledge: false
  }
};
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DonorManagerProps {
  donors: Donor[];
  transactions: Transaction[];
  pledges: Pledge[];
  funds: Fund[];
  onAddDonor: (d: DonorCreateInput) => Promise<string | undefined>;
  onUpdateDonor: (d: Donor) => void;
  onAddPledge: (p: PledgeCreateInput) => void;
  onUpdatePledge: (p: Pledge) => void;
  onUpdateTransaction: (t: Transaction) => void;
  currentUser: AppUser;
  churchDetails?: ChurchDetails;
}

const DonorManager: React.FC<DonorManagerProps> = ({ donors, transactions, pledges, funds, onAddDonor, onUpdateDonor, onAddPledge, onUpdatePledge, onUpdateTransaction, currentUser, churchDetails }) => {
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(donors[0]?._id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'profile' | 'communicate'>('overview');

  // Mobile view state for master-detail pattern
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Message template state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [selectedPledgeForTemplate, setSelectedPledgeForTemplate] = useState<string | null>(null);
  const [selectedFundForTemplate, setSelectedFundForTemplate] = useState<string | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Modals state
  const [showAddPledgeModal, setShowAddPledgeModal] = useState(false);
  const [showAddDonorModal, setShowAddDonorModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Merge state
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [isFindingDuplicates, setIsFindingDuplicates] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [selectedMergeGroup, setSelectedMergeGroup] = useState<number | null>(null);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string | null>(null);

  // Manual merge state
  const [manualMergeMode, setManualMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [manualPrimaryId, setManualPrimaryId] = useState<string | null>(null);

  // Convex mutations for merge
  const findDuplicates = useMutation(api.mutations.donors.findDuplicates);
  const mergeDonors = useMutation(api.mutations.donors.merge);

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
  const selectedDonor = donors.find(d => d._id === selectedDonorId);
  const donorTransactions = transactions.filter(t => t.donorId === selectedDonorId || t.donorName === selectedDonor?.name)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
  const lifetimeValue = donorTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
  const donorPledges = pledges.filter(p => p.donorId === selectedDonorId || p.donorName === selectedDonor?.name);
  const activePledges = donorPledges.filter(p => p.status === 'Active');

  const chartData = donorTransactions.filter(t => t.type === 'Income').slice(0, 10).map(t => ({
      date: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      amount: t.amount
  })).reverse();

  // Calculate year total for End of Year template
  const currentYear = new Date().getFullYear();
  const yearTotal = donorTransactions
    .filter(t => t.type === 'Income' && new Date(t.date).getFullYear() === currentYear)
    .reduce((acc, t) => acc + t.amount, 0);

  // Get completed pledges for the donor
  const completedPledges = donorPledges.filter(p => p.status === 'Completed');

  // Generate message from template with variable substitution
  const generateMessageFromTemplate = (templateType: TemplateType, pledgeId?: string, fundId?: string): string => {
    if (!selectedDonor) return '';

    const template = MESSAGE_TEMPLATES[templateType];
    let message = template.template;

    // Replace donor name
    message = message.replace(/{donorName}/g, selectedDonor.name);

    // Replace year total for end of year template
    message = message.replace(/{yearTotal}/g, yearTotal.toLocaleString());

    // Replace pledge-specific variables if a pledge is selected
    if (pledgeId) {
      const pledge = donorPledges.find(p => p._id === pledgeId);
      if (pledge) {
        const fundName = funds.find(f => f._id === pledge.fundId)?.name || 'General Fund';
        message = message.replace(/{pledgeAmount}/g, pledge.amount.toLocaleString());
        message = message.replace(/{frequency}/g, pledge.frequency);
        message = message.replace(/{fundName}/g, fundName);
      }
    } else if (fundId) {
      // For non-pledge templates, use selected fund
      const fundName = funds.find(f => f._id === fundId)?.name || 'General Fund';
      message = message.replace(/{fundName}/g, fundName);
    }

    return message;
  };

  // Handle template selection
  const handleSelectTemplate = (templateType: TemplateType) => {
    setSelectedTemplate(templateType);
    setCopiedToClipboard(false);

    const template = MESSAGE_TEMPLATES[templateType];
    if (template.requiresPledge) {
      // For pledge fulfillment, only show completed pledges
      const availablePledges = templateType === 'pledgeFulfillment' ? completedPledges : donorPledges;

      if (availablePledges.length > 0) {
        const firstPledge = availablePledges[0];
        setSelectedPledgeForTemplate(firstPledge._id);
        setSelectedFundForTemplate(null);
        setGeneratedMessage(generateMessageFromTemplate(templateType, firstPledge._id));
      } else {
        setSelectedPledgeForTemplate(null);
        setSelectedFundForTemplate(null);
        if (templateType === 'pledgeFulfillment') {
          setGeneratedMessage('No completed pledges found for this donor.');
        } else {
          setGeneratedMessage('No pledges found for this donor. Please add a pledge first.');
        }
      }
    } else {
      // For non-pledge templates, select first fund
      setSelectedPledgeForTemplate(null);
      if (funds.length > 0) {
        const firstFund = funds[0];
        setSelectedFundForTemplate(firstFund._id);
        setGeneratedMessage(generateMessageFromTemplate(templateType, undefined, firstFund._id));
      } else {
        setSelectedFundForTemplate(null);
        setGeneratedMessage(generateMessageFromTemplate(templateType));
      }
    }
  };

  // Handle pledge selection for template
  const handlePledgeSelectForTemplate = (pledgeId: string) => {
    setSelectedPledgeForTemplate(pledgeId);
    setCopiedToClipboard(false);
    if (selectedTemplate) {
      setGeneratedMessage(generateMessageFromTemplate(selectedTemplate, pledgeId));
    }
  };

  // Handle fund selection for template (non-pledge templates)
  const handleFundSelectForTemplate = (fundId: string) => {
    setSelectedFundForTemplate(fundId);
    setCopiedToClipboard(false);
    if (selectedTemplate) {
      setGeneratedMessage(generateMessageFromTemplate(selectedTemplate, undefined, fundId));
    }
  };

  // Copy message to clipboard
  const copyMessageToClipboard = async () => {
    if (!generatedMessage) return;
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  // Share via WhatsApp
  const shareMessageViaWhatsApp = () => {
    if (!selectedDonor?.phone || !generatedMessage) return;
    const cleanPhone = selectedDonor.phone.replace(/[^0-9]/g, '');
    const formatted = cleanPhone.startsWith('0') ? '44' + cleanPhone.substring(1) : cleanPhone;
    window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(generatedMessage)}`, '_blank');
  };

  const handleEditClick = () => { if (selectedDonor && canEdit) { setFormData(selectedDonor); setIsEditing(true); } };

  const handlePrintSchedule = (filterType: 'all' | 'tithes' | 'campaign', fundId?: string) => {
    if (!selectedDonor) return;

    let filteredPledges = donorPledges;
    let filteredTransactions = donorTransactions;
    let logoOverride: string | undefined;

    if (filterType === 'tithes') {
      // Filter to only unrestricted (tithe) funds
      const titheFundIds = funds.filter(f => f.type === 'Unrestricted').map(f => f._id);
      filteredPledges = donorPledges.filter(p => titheFundIds.includes(p.fundId));
      // Include transactions by fundId OR by pledgeId linked to matching pledges
      const tithePledgeIds = pledges.filter(p => titheFundIds.includes(p.fundId)).map(p => p._id);
      filteredTransactions = donorTransactions.filter(t =>
        titheFundIds.includes(t.fundId) || (t.pledgeId && tithePledgeIds.includes(t.pledgeId))
      );
    } else if (filterType === 'campaign' && fundId) {
      // Filter to specific campaign/fund
      filteredPledges = donorPledges.filter(p => p.fundId === fundId);
      // Include transactions by fundId OR by pledgeId linked to matching pledges
      const campaignPledgeIds = pledges.filter(p => p.fundId === fundId).map(p => p._id);
      filteredTransactions = donorTransactions.filter(t =>
        t.fundId === fundId || (t.pledgeId && campaignPledgeIds.includes(t.pledgeId))
      );
      // Use the campaign's logo if available
      const campaignFund = funds.find(f => f._id === fundId);
      if (campaignFund?.logoUrl) {
        logoOverride = campaignFund.logoUrl;
      }
    }

    const details = churchDetails || { name: 'ChurchCoin', address: '', email: '' };
    const html = generateScheduleHTML(selectedDonor, filteredPledges, funds, details, logoOverride, filteredTransactions);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 500);
    }
    setShowExportModal(false);
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

  const handleAddDonorSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newDonorData.name) {
          const newDonor: DonorCreateInput = {
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
          const createdId = await onAddDonor(newDonor);
          setShowAddDonorModal(false);
          setNewDonorData({ type: 'Individual', isGiftAidActive: false, communicationPreference: 'Email' });
          if (createdId) setSelectedDonorId(createdId);
          setActiveTab('profile'); 
      }
  };

  const handleAddPledgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDonor && newPledgeData.amount && newPledgeData.fundId) {
        const pledge: PledgeCreateInput = {
            donorId: selectedDonor._id,
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
      const pledge = pledges.find(p => p._id === oldPledgeId);
      if (pledge && pledge.status === 'Completed') {
           const remainingSum = transactions
              .filter(t => t.pledgeId === oldPledgeId && t._id !== transaction._id)
              .reduce((sum, t) => sum + t.amount, 0);

           if (remainingSum < pledge.amount) {
                onUpdatePledge({ ...pledge, status: 'Active' });
           }
      }
  };

  // Handle finding duplicate donors
  const handleFindDuplicates = async () => {
    setIsFindingDuplicates(true);
    try {
      const groups = await findDuplicates({});
      setDuplicateGroups(groups);
      if (groups.length === 0) {
        alert('No duplicate donors found!');
      } else {
        setShowMergeModal(true);
      }
    } catch (error) {
      console.error('Error finding duplicates:', error);
      alert('Failed to find duplicates');
    } finally {
      setIsFindingDuplicates(false);
    }
  };

  // Handle merging donors (auto-detected)
  const handleMergeDonors = async (groupIndex: number) => {
    const group = duplicateGroups[groupIndex];
    if (!group || !selectedPrimaryId) return;

    setIsMerging(true);
    try {
      const duplicateIds = group.donors
        .filter((d: any) => d._id !== selectedPrimaryId)
        .map((d: any) => d._id);

      const result = await mergeDonors({
        primaryDonorId: selectedPrimaryId as Id<"donors">,
        duplicateDonorIds: duplicateIds as Id<"donors">[],
      });

      alert(`Merged successfully!\n• ${result.mergedTransactions} transactions moved\n• ${result.mergedPledges} pledges moved\n• ${result.deletedDonors} duplicate(s) removed`);

      // Remove this group from the list
      setDuplicateGroups(prev => prev.filter((_, i) => i !== groupIndex));
      setSelectedMergeGroup(null);
      setSelectedPrimaryId(null);

      // If no more groups, close modal
      if (duplicateGroups.length <= 1) {
        setShowMergeModal(false);
      }
    } catch (error) {
      console.error('Error merging donors:', error);
      alert('Failed to merge donors');
    } finally {
      setIsMerging(false);
    }
  };

  // Toggle donor selection for manual merge
  const toggleDonorForMerge = (donorId: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(donorId)) {
        next.delete(donorId);
        // If we removed the primary, reset it
        if (manualPrimaryId === donorId) {
          setManualPrimaryId(null);
        }
      } else {
        next.add(donorId);
      }
      return next;
    });
  };

  // Handle manual merge
  const handleManualMerge = async () => {
    if (!manualPrimaryId || selectedForMerge.size < 2) return;

    setIsMerging(true);
    try {
      const duplicateIds = Array.from(selectedForMerge)
        .filter(id => id !== manualPrimaryId);

      const result = await mergeDonors({
        primaryDonorId: manualPrimaryId as Id<"donors">,
        duplicateDonorIds: duplicateIds as Id<"donors">[],
      });

      alert(`Merged successfully!\n• ${result.mergedTransactions} transactions moved\n• ${result.mergedPledges} pledges moved\n• ${result.deletedDonors} duplicate(s) removed`);

      // Reset manual merge state
      setManualMergeMode(false);
      setSelectedForMerge(new Set());
      setManualPrimaryId(null);
    } catch (error) {
      console.error('Error merging donors:', error);
      alert('Failed to merge donors');
    } finally {
      setIsMerging(false);
    }
  };

  // Cancel manual merge mode
  const cancelManualMerge = () => {
    setManualMergeMode(false);
    setSelectedForMerge(new Set());
    setManualPrimaryId(null);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] animate-enter gap-0 swiss-card overflow-hidden relative">
      {/* Sidebar - Directory */}
      <div className={`${mobileView === 'detail' ? 'hidden' : 'w-full'} md:block md:w-80 border-r border-ledger bg-white flex flex-col shrink-0`}>
        <div className="p-4 border-b border-ledger space-y-3">
          <div className="flex justify-between items-center">
              <h3 className="font-bold text-ink text-sm font-mono">Directory</h3>
              <div className="flex gap-1">
                {canEdit && !manualMergeMode && (
                  <button
                    onClick={() => setManualMergeMode(true)}
                    className="p-1.5 bg-amber-50 hover:bg-amber-100 rounded text-amber-700 transition-colors shadow-sm"
                    title="Select donors to merge"
                  >
                    <Merge size={14} />
                  </button>
                )}
                {canEdit && !manualMergeMode && <button onClick={() => setShowAddDonorModal(true)} className="p-1.5 bg-grey-light hover:bg-ledger rounded text-grey-dark transition-colors shadow-sm" title="Add New Donor"><Plus size={14} /></button>}
              </div>
          </div>
          {/* Manual merge mode banner */}
          {manualMergeMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800">Select donors to merge</span>
                <button onClick={cancelManualMerge} className="text-amber-600 hover:text-amber-800">
                  <X size={14} />
                </button>
              </div>
              <p className="text-[10px] text-amber-700">
                {selectedForMerge.size === 0 && "Click donors below to select them"}
                {selectedForMerge.size === 1 && "Select at least one more donor"}
                {selectedForMerge.size >= 2 && !manualPrimaryId && "Now click 'Keep' on the donor to keep as primary"}
                {selectedForMerge.size >= 2 && manualPrimaryId && `Ready to merge ${selectedForMerge.size} donors`}
              </p>
              {selectedForMerge.size >= 2 && manualPrimaryId && (
                <button
                  onClick={handleManualMerge}
                  disabled={isMerging}
                  className="w-full py-2 bg-amber-500 text-white rounded text-xs font-bold uppercase hover:bg-amber-600 disabled:opacity-50"
                >
                  {isMerging ? 'Merging...' : `Merge ${selectedForMerge.size} Donors`}
                </button>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" size={14} />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 text-xs border border-ledger rounded-md focus:outline-none focus:ring-1 focus:ring-ink bg-paper focus:bg-white transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredDonors.map(donor => {
            const isSelectedForMerge = selectedForMerge.has(donor._id);
            const isPrimary = manualPrimaryId === donor._id;

            return (
              <div
                key={donor._id}
                className={`w-full text-left px-4 py-3 border-b border-grey-light transition-colors flex items-center gap-3 ${
                  manualMergeMode && isSelectedForMerge
                    ? 'bg-amber-50 border-l-4 border-l-amber-500'
                    : selectedDonorId === donor._id
                    ? 'bg-paper border-l-4 border-l-ink'
                    : 'hover:bg-paper border-l-4 border-l-transparent'
                }`}
              >
                {/* Merge mode checkbox */}
                {manualMergeMode && (
                  <button
                    onClick={() => toggleDonorForMerge(donor._id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelectedForMerge
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'border-grey-mid hover:border-amber-500'
                    }`}
                  >
                    {isSelectedForMerge && <Check size={12} />}
                  </button>
                )}

                {/* Donor info - clickable */}
                <button
                  onClick={() => {
                    if (manualMergeMode) {
                      toggleDonorForMerge(donor._id);
                    } else {
                      setSelectedDonorId(donor._id);
                      setMobileView('detail'); // Switch to detail view on mobile
                      setGeneratedMessage('');
                      setSelectedTemplate(null);
                      setSelectedPledgeForTemplate(null);
                      setSelectedFundForTemplate(null);
                    }
                  }}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isPrimary ? 'bg-amber-500 text-white' : 'bg-ledger text-grey-dark'
                  }`}>
                    {donor.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className={`text-sm font-bold truncate ${selectedDonorId === donor._id ? 'text-ink' : 'text-grey-dark'}`}>
                      {donor.name}
                      {isPrimary && <span className="ml-1 text-[10px] text-amber-600">(Primary)</span>}
                    </div>
                    <div className="text-[10px] text-grey-mid truncate">{donor.email || donor.type}</div>
                  </div>
                </button>

                {/* Keep as primary button */}
                {manualMergeMode && isSelectedForMerge && selectedForMerge.size >= 2 && !isPrimary && (
                  <button
                    onClick={() => setManualPrimaryId(donor._id)}
                    className="text-[10px] px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 shrink-0"
                  >
                    Keep
                  </button>
                )}
              </div>
            );
          })}
          {filteredDonors.length === 0 && <div className="p-8 text-center text-grey-mid text-xs">No donors found.</div>}
        </div>
      </div>

      {/* Main Content */}
      <div className={`${mobileView === 'list' ? 'hidden' : 'flex-1'} md:flex md:flex-1 flex-col bg-paper overflow-hidden`}>
        {selectedDonor ? (
          <>
            <div className="bg-white border-b border-ledger px-4 md:px-6 py-4 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
               <div className="flex items-center gap-4">
                  {/* Back button for mobile */}
                  <button
                    onClick={() => setMobileView('list')}
                    className="md:hidden p-2 -ml-2 text-grey-mid hover:text-ink hover:bg-grey-light rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </button>
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
                       <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-3 py-2 bg-white border border-ledger rounded text-xs font-bold text-grey-dark hover:border-grey-mid transition-colors"><Printer size={14} /> <span className="hidden lg:inline">Export</span></button>
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
                                    <div key={p._id} className="flex justify-between items-center p-3 border border-ledger rounded-lg hover:bg-paper transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-md ${p.status === 'Active' ? 'bg-sage-light text-sage' : 'bg-grey-light text-grey-mid'}`}><Wallet size={16} /></div>
                                            <div><div className="font-bold text-ink text-sm">{funds.find(f => f._id === p.fundId)?.name}</div><div className="text-xs text-grey-mid font-medium">{p.frequency}</div></div>
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
                            <>
                              {/* Mobile List View */}
                              <div className="md:hidden divide-y divide-grey-light">
                                {donorTransactions.map(t => {
                                  const linkedPledge = pledges.find(p => p._id === t.pledgeId);
                                  return (
                                    <div key={t._id} className="p-4">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-ink text-sm truncate">{t.description}</div>
                                          <div className="text-xs text-grey-mid mt-0.5 flex items-center gap-2">
                                            <span className="font-mono">{t.date}</span>
                                            <span className="px-1.5 py-0.5 bg-grey-light rounded text-[10px] font-bold text-grey-dark uppercase border border-ledger">{funds.find(f => f._id === t.fundId)?.name}</span>
                                          </div>
                                        </div>
                                        <div className={`font-mono text-lg font-bold ${t.type === TransactionType.INCOME ? 'text-sage' : 'text-ink'}`}>
                                          {t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}
                                        </div>
                                      </div>
                                      {t.type === TransactionType.INCOME && canEdit && (
                                        <div className="mt-2 pt-2 border-t border-grey-light">
                                          {linkedPledge ? (
                                            <div className="flex items-center justify-between">
                                              <div className="px-2 py-1 bg-sage-light text-sage-dark rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 border border-sage/30">
                                                <LinkIcon size={10} /> Linked to Pledge
                                              </div>
                                              <button onClick={() => handleUnlinkTransaction(t)} className="text-xs text-grey-mid hover:text-error transition-colors" title="Unlink">
                                                Unlink
                                              </button>
                                            </div>
                                          ) : (
                                            <select onChange={(e) => handleLinkTransaction(t, e.target.value)} value="" className="w-full bg-paper border border-ledger text-xs text-grey-dark rounded px-3 py-2 focus:ring-1 focus:ring-ink outline-none">
                                              <option value="">Link to Pledge...</option>
                                              {activePledges.map(p => <option key={p._id} value={p._id}>{funds.find(f => f._id === p.fundId)?.name} (£{p.amount})</option>)}
                                            </select>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Desktop Table View */}
                              <table className="hidden md:table w-full text-left ledger-table">
                                <thead className="bg-white"><tr><th className="pl-6 py-4">Date</th><th className="px-4 py-4">Description</th><th className="px-4 py-4 text-right">Amount</th><th className="px-4 py-4">Fund</th><th className="px-4 py-4">Pledge Link</th></tr></thead>
                                <tbody>
                                    {donorTransactions.map(t => {
                                        const linkedPledge = pledges.find(p => p._id === t.pledgeId);
                                        return (
                                            <tr key={t._id} className="hover:bg-paper transition-colors group">
                                                <td className="pl-6 py-3 text-grey-mid font-mono text-xs border-b border-grey-light">{t.date}</td>
                                                <td className="px-4 py-3 font-medium text-ink text-sm border-b border-grey-light">{t.description}</td>
                                                <td className={`px-4 py-3 font-mono text-sm font-bold text-right border-b border-grey-light ${t.type === TransactionType.INCOME ? 'text-sage' : 'text-ink'}`}>{t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}</td>
                                                <td className="px-4 py-3 border-b border-grey-light"><span className="px-2 py-0.5 bg-grey-light rounded text-[10px] font-bold text-grey-dark uppercase tracking-wide border border-ledger">{funds.find(f => f._id === t.fundId)?.name}</span></td>
                                                <td className="px-4 py-3 border-b border-grey-light">
                                                    {t.type === TransactionType.INCOME && canEdit ? (
                                                        linkedPledge ? <div className="flex items-center gap-2"><div className="px-2 py-1 bg-sage-light text-sage-dark rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 border border-sage/30"><LinkIcon size={10} /> Linked</div><button onClick={() => handleUnlinkTransaction(t)} className="text-grey-mid hover:text-error transition-colors p-1" title="Unlink"><Unlink size={12} /></button></div> :
                                                        <div className="relative group/select">
                                                            <select onChange={(e) => handleLinkTransaction(t, e.target.value)} value="" className="appearance-none bg-white border border-ledger hover:border-grey-mid text-xs text-grey-mid rounded px-2 py-1 pr-6 focus:ring-1 focus:ring-ink outline-none w-full max-w-[140px] cursor-pointer">
                                                                <option value="">Link Pledge...</option>
                                                                {activePledges.map(p => <option key={p._id} value={p._id}>{funds.find(f => f._id === p.fundId)?.name} (£{p.amount})</option>)}
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
                            </>
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
                        <h3 className="font-bold text-ink flex items-center gap-2 text-sm uppercase tracking-wide mb-4">
                            <MessageSquare size={16} /> Message Templates
                        </h3>

                        {/* Template Selection Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                            {(Object.entries(MESSAGE_TEMPLATES) as [TemplateType, MessageTemplate][]).map(([key, template]) => (
                                <button
                                    key={key}
                                    onClick={() => handleSelectTemplate(key)}
                                    className={`p-3 text-left border rounded-lg transition-all ${
                                        selectedTemplate === key
                                            ? 'border-ink bg-ink text-white'
                                            : 'border-ledger bg-white hover:border-grey-mid hover:bg-paper'
                                    }`}
                                >
                                    <div className={`text-xs font-bold mb-1 ${selectedTemplate === key ? 'text-white' : 'text-ink'}`}>
                                        {template.name}
                                    </div>
                                    <div className={`text-[10px] ${selectedTemplate === key ? 'text-grey-light' : 'text-grey-mid'}`}>
                                        {template.description}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Pledge Selector (for pledge-specific templates) */}
                        {selectedTemplate && MESSAGE_TEMPLATES[selectedTemplate].requiresPledge && (
                            <div className="mb-4">
                                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">
                                    Select Pledge
                                </label>
                                {(() => {
                                    const availablePledges = selectedTemplate === 'pledgeFulfillment' ? completedPledges : donorPledges;
                                    return availablePledges.length > 0 ? (
                                        <select
                                            value={selectedPledgeForTemplate || ''}
                                            onChange={(e) => handlePledgeSelectForTemplate(e.target.value)}
                                            className="w-full max-w-sm p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"
                                        >
                                            {availablePledges.map(p => (
                                                <option key={p._id} value={p._id}>
                                                    {funds.find(f => f._id === p.fundId)?.name} - £{p.amount} ({p.frequency}) - {p.status}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-xs text-grey-mid italic">
                                            {selectedTemplate === 'pledgeFulfillment'
                                                ? 'No completed pledges found for this donor.'
                                                : 'No pledges found for this donor.'}
                                        </p>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Fund Selector (for non-pledge templates) */}
                        {selectedTemplate && !MESSAGE_TEMPLATES[selectedTemplate].requiresPledge && funds.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">
                                    Select Fund
                                </label>
                                <select
                                    value={selectedFundForTemplate || ''}
                                    onChange={(e) => handleFundSelectForTemplate(e.target.value)}
                                    className="w-full max-w-sm p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"
                                >
                                    {funds.map(f => (
                                        <option key={f._id} value={f._id}>
                                            {f.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Generated Message Preview */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2">
                                Message Preview
                            </label>
                            <textarea
                                className="w-full h-48 p-4 text-sm border border-ledger rounded-lg focus:ring-1 focus:ring-ink focus:border-grey-mid outline-none leading-relaxed resize-none bg-paper text-grey-dark"
                                value={generatedMessage}
                                onChange={(e) => setGeneratedMessage(e.target.value)}
                                placeholder="Select a template above to generate a message..."
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={copyMessageToClipboard}
                                disabled={!generatedMessage}
                                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                                    copiedToClipboard
                                        ? 'bg-sage-light text-sage-dark'
                                        : generatedMessage
                                            ? 'bg-grey-light text-grey-dark hover:bg-ledger'
                                            : 'bg-grey-light text-grey-mid cursor-not-allowed'
                                }`}
                            >
                                {copiedToClipboard ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                {copiedToClipboard ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                                onClick={shareMessageViaWhatsApp}
                                disabled={!generatedMessage || !selectedDonor?.phone}
                                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                                    generatedMessage && selectedDonor?.phone
                                        ? 'bg-[#25D366] text-white hover:bg-[#128C7E]'
                                        : 'bg-grey-light text-grey-mid cursor-not-allowed'
                                }`}
                                title={!selectedDonor?.phone ? 'No phone number on file' : ''}
                            >
                                <Send size={14} /> WhatsApp
                            </button>
                        </div>

                        {/* No phone warning */}
                        {generatedMessage && !selectedDonor?.phone && (
                            <p className="text-[10px] text-amber-dark mt-2 text-right">
                                No phone number on file for this donor
                            </p>
                        )}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2"><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Full Name *</label><input type="text" value={newDonorData.name || ''} onChange={e => setNewDonorData({...newDonorData, name: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors" required placeholder="e.g. John Doe"/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Email</label><input type="email" value={newDonorData.email || ''} onChange={e => setNewDonorData({...newDonorData, email: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Phone</label><input type="tel" value={newDonorData.phone || ''} onChange={e => setNewDonorData({...newDonorData, phone: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Address</label>
                        <textarea value={newDonorData.address || ''} onChange={e => setNewDonorData({...newDonorData, address: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors h-16 resize-none" placeholder="Street, City..."/>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Postcode</label><input type="text" value={newDonorData.postcode || ''} onChange={e => setNewDonorData({...newDonorData, postcode: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"/></div>
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Comm. Preference</label><select value={newDonorData.communicationPreference || 'Email'} onChange={e => setNewDonorData({...newDonorData, communicationPreference: e.target.value as any})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="Email">Email</option><option value="Post">Post</option><option value="Phone">Phone</option></select></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2"><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Full Name</label><input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors" required/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Email</label><input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Phone</label><input type="tel" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors"/></div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Address</label>
                          <textarea value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors h-16 resize-none"/>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Postcode</label><input type="text" value={formData.postcode || ''} onChange={e => setFormData({...formData, postcode: e.target.value})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"/></div>
                           <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Comm. Preference</label><select value={formData.communicationPreference || 'Email'} onChange={e => setFormData({...formData, communicationPreference: e.target.value as any})} className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="Email">Email</option><option value="Post">Post</option><option value="Phone">Phone</option></select></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Target Fund</label><select value={newPledgeData.fundId || ''} onChange={e => setNewPledgeData({...newPledgeData, fundId: e.target.value})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-colors" required><option value="">Select Fund...</option>{funds.map(f => (<option key={f._id} value={f._id}>{f.name}</option>))}</select></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Amount</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid text-xs">£</span><input type="number" value={newPledgeData.amount || ''} onChange={e => setNewPledgeData({...newPledgeData, amount: parseFloat(e.target.value)})} className="w-full pl-6 p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono" placeholder="0.00" required/></div></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Frequency</label><select value={newPledgeData.frequency} onChange={e => setNewPledgeData({...newPledgeData, frequency: e.target.value as any})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none"><option value="One-off">One-off</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="Annual">Annual</option></select></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Start Date</label><input type="date" value={newPledgeData.startDate} onChange={e => setNewPledgeData({...newPledgeData, startDate: e.target.value})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono" required/></div>
                        <div><label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">End Date (Optional)</label><input type="date" value={newPledgeData.endDate || ''} onChange={e => setNewPledgeData({...newPledgeData, endDate: e.target.value})} className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"/></div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-ledger mt-4"><button type="button" onClick={() => setShowAddPledgeModal(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">Cancel</button><button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2"><Plus size={14} /> Create Schedule</button></div>
                </form>
            </div>
        </div>
      )}

      {showExportModal && selectedDonor && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-ledger animate-enter">
                <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
                    <h3 className="font-bold text-ink text-sm uppercase tracking-wide flex items-center gap-2">
                        <Printer size={16} /> Export Schedule
                    </h3>
                    <button onClick={() => setShowExportModal(false)} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button>
                </div>
                <div className="p-6 space-y-3">
                    <p className="text-xs text-grey-mid mb-4">Select which giving schedule to export for <strong>{selectedDonor.name}</strong></p>

                    {(() => {
                        const incomeTransactions = donorTransactions.filter(t => t.type === 'Income');
                        const unrestrictedFundIds = funds.filter(f => f.type === 'Unrestricted').map(f => f._id);
                        const titheTransactions = incomeTransactions.filter(t => unrestrictedFundIds.includes(t.fundId));
                        const hasAllTransactions = incomeTransactions.length > 0;
                        const hasTitheTransactions = titheTransactions.length > 0;

                        return (
                            <>
                                <button
                                    onClick={() => handlePrintSchedule('all')}
                                    className="w-full p-4 text-left border border-ledger rounded-lg hover:border-ink hover:bg-paper transition-colors group"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-ink text-sm">All Schedules</div>
                                            <div className="text-xs text-grey-mid mt-1">Export complete giving statement across all funds</div>
                                        </div>
                                        {hasAllTransactions && (
                                            <div className="text-[10px] font-mono text-grey-mid bg-grey-light px-2 py-1 rounded">
                                                Available
                                            </div>
                                        )}
                                    </div>
                                </button>

                                <button
                                    onClick={() => handlePrintSchedule('tithes')}
                                    className="w-full p-4 text-left border border-ledger rounded-lg hover:border-ink hover:bg-paper transition-colors group"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-ink text-sm">Tithes</div>
                                            <div className="text-xs text-grey-mid mt-1">Export tithe statement only</div>
                                        </div>
                                        {hasTitheTransactions && (
                                            <div className="text-[10px] font-mono text-grey-mid bg-grey-light px-2 py-1 rounded">
                                                Available
                                            </div>
                                        )}
                                    </div>
                                </button>

                                {funds.filter(f => f.type === 'Restricted').length > 0 && (
                                    <>
                                        <div className="text-[10px] font-bold text-grey-mid uppercase tracking-wide pt-3 pb-1">Campaigns</div>
                                        {funds.filter(f => f.type === 'Restricted').map(fund => {
                                            const campaignTransactions = incomeTransactions.filter(t => t.fundId === fund._id);
                                            const hasCampaignTransactions = campaignTransactions.length > 0;

                                            return (
                                                <button
                                                    key={fund._id}
                                                    onClick={() => handlePrintSchedule('campaign', fund._id)}
                                                    className="w-full p-4 text-left border border-ledger rounded-lg hover:border-ink hover:bg-paper transition-colors group"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="font-bold text-ink text-sm">{fund.name}</div>
                                                            <div className="text-xs text-grey-mid mt-1">{fund.description || 'Campaign fund'}</div>
                                                        </div>
                                                        {hasCampaignTransactions && (
                                                            <div className="text-[10px] font-mono text-grey-mid bg-grey-light px-2 py-1 rounded">
                                                                Available
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </>
                                )}
                            </>
                        );
                    })()}

                    <div className="flex justify-end pt-4 border-t border-ledger mt-4">
                        <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Merge Duplicates Modal */}
      {showMergeModal && canEdit && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl border border-ledger animate-enter max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
              <h3 className="font-bold text-ink text-sm uppercase tracking-wide flex items-center gap-2">
                <Users size={16} /> Merge Duplicate Donors
              </h3>
              <button onClick={() => setShowMergeModal(false)} className="text-grey-mid hover:text-grey-dark">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {duplicateGroups.length === 0 ? (
                <p className="text-grey-mid text-sm text-center py-8">No duplicate donors found.</p>
              ) : (
                <div className="space-y-6">
                  <p className="text-xs text-grey-mid">
                    Found {duplicateGroups.length} group(s) of potential duplicates. Select the primary donor to keep, and duplicates will be merged into it.
                  </p>

                  {duplicateGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className="border border-ledger rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-grey-mid uppercase">
                          Group {groupIndex + 1} - {group.donors.length} donors
                        </span>
                        {selectedMergeGroup === groupIndex && selectedPrimaryId && (
                          <button
                            onClick={() => handleMergeDonors(groupIndex)}
                            disabled={isMerging}
                            className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-bold uppercase hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
                          >
                            {isMerging ? 'Merging...' : <><Merge size={12} /> Merge</>}
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {group.donors.map((donor: any) => {
                          const isSelected = selectedMergeGroup === groupIndex && selectedPrimaryId === donor._id;
                          const isSuggested = group.suggestedPrimary === donor._id;

                          return (
                            <button
                              key={donor._id}
                              onClick={() => {
                                setSelectedMergeGroup(groupIndex);
                                setSelectedPrimaryId(donor._id);
                              }}
                              className={`w-full p-3 text-left border rounded-lg transition-colors ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-50'
                                  : 'border-ledger hover:border-grey-mid hover:bg-paper'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-ink text-sm flex items-center gap-2">
                                    {donor.name}
                                    {isSuggested && (
                                      <span className="text-[10px] bg-sage/20 text-sage-dark px-1.5 py-0.5 rounded">
                                        Suggested
                                      </span>
                                    )}
                                    {isSelected && (
                                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-grey-mid mt-1 flex gap-3">
                                    {donor.email && <span>{donor.email}</span>}
                                    {donor.phone && <span>{donor.phone}</span>}
                                    {!donor.email && !donor.phone && <span className="italic">No contact info</span>}
                                  </div>
                                </div>
                                <div className="text-right text-xs text-grey-mid">
                                  {donor.isGiftAidActive && (
                                    <span className="text-sage">Gift Aid ✓</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-ledger flex justify-end">
              <button
                onClick={() => setShowMergeModal(false)}
                className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DonorManager;
