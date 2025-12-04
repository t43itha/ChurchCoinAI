export enum TransactionType {
  INCOME = 'Income',
  EXPENDITURE = 'Expenditure'
}

export enum FundType {
  UNRESTRICTED = 'Unrestricted',
  RESTRICTED = 'Restricted',
  DESIGNATED = 'Designated',
  ENDOWMENT = 'Endowment'
}

export interface Fund {
  id: string;
  name: string;
  type: FundType;
  balance: number;
  description?: string;
  targetAmount?: number;
  deadline?: string; // For campaigns/projects
}

export interface Pledge {
  id: string;
  donorName: string; // Acts as foreign key to Donor.name or Donor.id logic
  donorId?: string;
  amount: number;
  fundId: string;
  frequency: 'One-off' | 'Monthly' | 'Annual' | 'Weekly';
  startDate: string;
  endDate?: string;
  status: 'Active' | 'Completed' | 'Cancelled';
}

export interface Donor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  type: 'Individual' | 'Organization';
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  fundId: string;
  isReconciled: boolean;
  notes?: string;
  isGiftAidEligible?: boolean;
  donorName?: string; // For linking to pledges
  donorId?: string;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  type: 'warning' | 'info' | 'success';
  date: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
}