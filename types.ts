
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

export const PaymentMethod = {
  CASH: "Cash",
  BANK: "Bank",
  CARD: "Card",
  ONLINE: "Online",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const CashCollectionStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  BANKED: "banked",
} as const;

export type CashCollectionStatus = (typeof CashCollectionStatus)[keyof typeof CashCollectionStatus];

export type UserRole = 'Admin' | 'Finance Team' | 'Pastorate' | 'Guest';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface AppUser {
  _id: string;
  clerkId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Invitation {
  _id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number;
}

export type InvitationCreateInput = Pick<Invitation, 'email' | 'role'>;

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
  paymentMethod?: PaymentMethod;
  cashCollectionId?: string;
}

export type TransactionCreateInput = Omit<Transaction, "_id">;

export interface CashCollection {
  _id: string;
  organizationId: string;
  weekEndingDate: string; // ISO date (Sunday)
  collectionDate: string; // When cash was collected
  recordedAt: number; // Timestamp when recorded
  recordedBy: string; // User ID for audit trail
  notes?: string;
  status: CashCollectionStatus;
  bankedDate?: string;
  createdAt: number;
}

export type CashCollectionCreateInput = Omit<CashCollection, "_id" | "createdAt" | "recordedAt">;

// Input types for cash collection entry
export interface TitheEntry {
  donorName: string;
  donorId?: string;
  amount: number;
  isGiftAidEligible: boolean;
}

export interface CategoryTotalEntry {
  category: string;
  fundId: string;
  amount: number;
}

export interface PettyCashEntry {
  purpose: string;
  amount: number;
  category: string;
}

export interface CashCollectionSubmitInput {
  weekEndingDate: string;
  collectionDate: string;
  notes?: string;
  tithes: TitheEntry[];
  categoryTotals: CategoryTotalEntry[];
  pettyCash: PettyCashEntry[];
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

// RCI Category System Types
export interface Category {
  _id: string;
  name: string;
  mainCategory?: string;
  transactionType?: TransactionType;
  displayOrder?: number;
}

export interface CategoryGroup {
  mainCategory: string;
  subcategories: { name: string; total: number }[];
  total: number;
}

// Monthly Report Types (RCI Monthly Accounts)
export interface MonthlyReportData {
  year: number;
  month: number;
  monthName: string;
  receipts: CategoryGroup[];        // Income grouped by mainCategory
  payments: CategoryGroup[];        // Expenditure grouped by mainCategory
  weeklyBreakdown: WeeklyBreakdownItem[];
  missionTithe: {
    weeklyBreakdown: MissionTitheItem[];
    total: number;
    titheToPay: number;  // 10% of total
  };
  tithes: TitheBreakdownItem[];
  giftAidSummary: {
    eligible: number;
    claimable: number;
  };
  totals: {
    grossIncome: number;
    totalExpenditure: number;
    netBankable: number;
  };
}

export interface WeeklyBreakdownItem {
  weekEnding: string;
  receiptsTotal: number;
  paymentsTotal: number;
  byCategory: Record<string, number>;
}

export interface MissionTitheItem {
  weekEnding: string;
  total: number;  // Combined Offerings + Tithes + Thanksgiving
}

export interface TitheBreakdownItem {
  donorName: string;
  amount: number;
  isGiftAidEligible: boolean;
}

// Annual Report Types (RCI Annual Report)
export interface AnnualReportData {
  year: number;
  incomeByMainCategory: Record<string, { total: number; subcategories: { name: string; total: number }[] }>;
  expenditureByMainCategory: Record<string, { total: number; subcategories: { name: string; total: number }[] }>;
  monthlyTrend: { month: string; income: number; expenditure: number }[];
  yearOverYear?: {
    current: { income: number; expenditure: number };
    previous: { income: number; expenditure: number };
    incomeChange: number;
    expenditureChange: number;
  };
  giftAidAnnual: {
    totalEligible: number;
    totalClaimable: number;
  };
  fundBalances: { fund: string; balance: number; type: string }[];
  totals: {
    totalIncome: number;
    totalExpenditure: number;
    netMovement: number;
  };
}
