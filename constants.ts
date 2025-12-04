import { Fund, FundType, Transaction, TransactionType, Pledge, Donor, AppUser } from './types';

export const INITIAL_FUNDS: Fund[] = [
  {
    id: 'f1',
    name: 'General Fund',
    type: FundType.UNRESTRICTED,
    balance: 12450.00,
    description: 'Day to day running costs'
  },
  {
    id: 'f2',
    name: 'Building Project',
    type: FundType.RESTRICTED,
    balance: 45000.00,
    targetAmount: 150000.00,
    deadline: '2024-12-31',
    description: 'For the new roof and annex'
  },
  {
    id: 'f3',
    name: 'Youth Ministry',
    type: FundType.DESIGNATED,
    balance: 3200.50,
    description: 'Allocated by PCC for youth work'
  },
  {
    id: 'f4',
    name: 'Mission Support',
    type: FundType.RESTRICTED,
    balance: 1500.00,
    description: 'Overseas mission partners'
  }
];

export const MOCK_USERS: AppUser[] = [
  { 
    id: 'u1', 
    name: 'Sarah Treasurer', 
    email: 'sarah.t@church.org', 
    role: 'Admin', 
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150' 
  },
  { 
    id: 'u2', 
    name: 'David Finance', 
    email: 'david.f@church.org', 
    role: 'Finance Team',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150&h=150'
  },
  { 
    id: 'u3', 
    name: 'Rev. John Doe', 
    email: 'john.doe@church.org', 
    role: 'Pastorate' 
  },
  { 
    id: 'u4', 
    name: 'Ext. Auditor', 
    email: 'audit@firm.com', 
    role: 'Guest' 
  }
];

export const INITIAL_DONORS: Donor[] = [
  { 
    id: 'd1', 
    name: 'Robert Brown', 
    email: 'rob.brown@example.com', 
    phone: '07700 900123',
    address: '12 Oak Avenue, Springfield, SP1 2BB',
    isGiftAidActive: true,
    type: 'Individual', 
    notes: 'Major donor for building project' 
  },
  { 
    id: 'd2', 
    name: 'Sarah Jenkins', 
    email: 's.jenkins@example.com', 
    phone: '07700 900456',
    address: 'Flat 4, The Mews, London, SW1',
    isGiftAidActive: true,
    type: 'Individual', 
    notes: 'PCC Member' 
  },
  { 
    id: 'd3', 
    name: 'John Smith', 
    email: 'jsmith@example.com', 
    type: 'Individual',
    isGiftAidActive: true
  },
  { 
    id: 'd4', 
    name: 'Anonymous Donor', 
    type: 'Individual',
    isGiftAidActive: false
  },
  { 
    id: 'd5', 
    name: 'James Wilson', 
    type: 'Individual',
    isGiftAidActive: false
  }
];

export const INITIAL_PLEDGES: Pledge[] = [
  { id: 'p1', donorName: 'Robert Brown', donorId: 'd1', amount: 5000, fundId: 'f2', frequency: 'One-off', startDate: '2023-01-01', status: 'Active' },
  { id: 'p2', donorName: 'Sarah Jenkins', donorId: 'd2', amount: 200, fundId: 'f2', frequency: 'Monthly', startDate: '2023-01-01', endDate: '2024-12-31', status: 'Active' },
  { id: 'p3', donorName: 'Anonymous Donor', donorId: 'd4', amount: 10000, fundId: 'f2', frequency: 'One-off', startDate: '2023-06-01', status: 'Completed' },
  { id: 'p4', donorName: 'James Wilson', donorId: 'd5', amount: 50, fundId: 'f1', frequency: 'Monthly', startDate: '2023-01-01', status: 'Active' },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 't1',
    date: '2023-10-01',
    description: 'Standing Order - J Smith',
    amount: 50.00,
    type: TransactionType.INCOME,
    category: 'Donations',
    fundId: 'f1',
    isReconciled: true,
    isGiftAidEligible: true,
    donorName: 'John Smith',
    donorId: 'd3'
  },
  {
    id: 't2',
    date: '2023-10-02',
    description: 'Octopus Energy Direct Debit',
    amount: 145.20,
    type: TransactionType.EXPENDITURE,
    category: 'Utilities',
    fundId: 'f1',
    isReconciled: true
  },
  {
    id: 't3',
    date: '2023-10-05',
    description: 'Coffee Morning Cash',
    amount: 85.50,
    type: TransactionType.INCOME,
    category: 'Fundraising',
    fundId: 'f1',
    isReconciled: false,
    isGiftAidEligible: false
  },
  {
    id: 't4',
    date: '2023-10-10',
    description: 'B&Q Materials',
    amount: 230.00,
    type: TransactionType.EXPENDITURE,
    category: 'Maintenance',
    fundId: 'f2',
    isReconciled: false
  },
  {
    id: 't5',
    date: '2023-10-12',
    description: 'Youth Weekend Away Deposit',
    amount: 500.00,
    type: TransactionType.EXPENDITURE,
    category: 'Ministry',
    fundId: 'f3',
    isReconciled: false
  },
  {
    id: 't6',
    date: '2023-10-15',
    description: 'R Brown - Building Fund',
    amount: 5000.00,
    type: TransactionType.INCOME,
    category: 'Donations',
    fundId: 'f2',
    isReconciled: true,
    isGiftAidEligible: true,
    donorName: 'Robert Brown',
    donorId: 'd1'
  },
  {
    id: 't7',
    date: '2023-10-20',
    description: 'S Jenkins Monthly',
    amount: 200.00,
    type: TransactionType.INCOME,
    category: 'Donations',
    fundId: 'f2',
    isReconciled: true,
    isGiftAidEligible: true,
    donorName: 'Sarah Jenkins',
    donorId: 'd2'
  }
];

export const CATEGORIES = [
  'Tithe',
  'Donations',
  'Grants',
  'Fundraising',
  'Investment Income',
  'Gift Aid',
  'Utilities',
  'Salaries',
  'Maintenance',
  'Ministry',
  'Mission Giving',
  'Administration',
  'Sundries'
];