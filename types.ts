
export const TransactionType = {
  INCOME: "Income",
  EXPENDITURE: "Expenditure",
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const FundType = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED: "Restricted",
  DESIGNATED: "Designated",
  ENDOWMENT: "Endowment",
} as const;

export type FundType = (typeof FundType)[keyof typeof FundType];

export type UserRole = 'Admin' | 'Finance Team' | 'Pastorate' | 'Guest';

export interface AppUser {
  _id: string;
  /** Clerk userId (required for backend invites) */
  clerkId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
}

export type AppUserInviteInput = Pick<
  AppUser,
  "clerkId" | "name" | "email" | "role" | "avatarUrl"
>;

export interface ChurchDetails {
  name: string;
  charityNumber?: string;
  address?: string;
  email?: string;
  website?: string;
  reportingPeriod?: 'tax_year' | 'calendar_year';
  logoUrl?: string;
}

export interface Fund {
  _id: string;
  name: string;
  type: FundType;
  balance: number;
  description?: string;
  targetAmount?: number;
  deadline?: string; // For campaigns/projects
  logoUrl?: string;
}

export type FundCreateInput = Pick<
  Fund,
  "name" | "type" | "description" | "targetAmount" | "deadline" | "logoUrl"
>;

export interface Pledge {
  _id: string;
  donorName: string; // Acts as foreign key to Donor.name or Donor.id logic
  donorId?: string;
  amount: number;
  fundId: string;
  frequency: 'One-off' | 'Monthly' | 'Annual' | 'Weekly';
  startDate: string;
  endDate?: string;
  status: 'Active' | 'Completed' | 'Cancelled';
}

export type PledgeCreateInput = Omit<Pledge, "_id">;

export interface Donor {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  postcode?: string;
  notes?: string;
  type: 'Individual' | 'Organization';
  isGiftAidActive?: boolean;
  communicationPreference?: 'Email' | 'Post' | 'Phone';
}

export type DonorCreateInput = Omit<Donor, "_id">;

export interface Transaction {
  _id: string;
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
  pledgeId?: string | null;
}

export type TransactionCreateInput = Omit<Transaction, "_id">;

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
