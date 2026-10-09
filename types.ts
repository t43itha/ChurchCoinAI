import type { UserRole } from "./lib/permissions";
import type { MovementKind } from "./lib/movementCategories";
import type { TransferSummary } from "./lib/reportableTransactions";
import type { DateRange, ReportPeriod } from "./lib/reportPeriods";
import type {
  DataReadiness,
  FundStatement,
  GivingByDonor,
  PeriodTotals,
  ReserveCover,
  TrendPoint,
} from "./lib/reportSummary";

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
  CHEQUE: "Cheque",
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

export const CashBankingStatus = {
  NOT_STARTED: "not_started",
  PARTIALLY_BANKED: "partially_banked",
  BANKED: "banked",
} as const;

export type CashBankingStatus = (typeof CashBankingStatus)[keyof typeof CashBankingStatus];

export const CashBankingRole = {
  SOURCE_GIVING: "source_giving",
  BANK_DEPOSIT: "bank_deposit",
} as const;

export type CashBankingRole = (typeof CashBankingRole)[keyof typeof CashBankingRole];

export type BankingMedium = "cash" | "cheque" | "mixed";

export type CashBankingVarianceType =
  | "partial_banking"
  | "petty_cash_retained_or_spent"
  | "bank_counting_difference"
  | "cheque_timing"
  | "other";

export type { UserRole } from "./lib/permissions";

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface AppUser {
  _id: string;
  clerkId?: string;
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
  token?: string;
  lastSentAt?: number;
  createdAt: number;
  expiresAt: number;
}

export type InvitationCreateInput = Pick<Invitation, 'email' | 'role'>;

export interface InvitationSendResult {
  invitationId: string;
  inviteUrl: string;
  emailSent: boolean;
  emailError?: string;
}

export interface ChurchDetails {
  name: string;
  charityNumber?: string;
  address?: string;
  email?: string;
  website?: string;
  reportingPeriod?: 'tax_year' | 'calendar_year';
  giftAidEnabled?: boolean;
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
  defaultIncomeCategory?: string;
}

export type FundCreateInput = Pick<
  Fund,
  "name" | "type" | "description" | "targetAmount" | "deadline" | "logoUrl" | "defaultIncomeCategory"
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
  cashBankingReconciliationId?: string;
  cashBankingRole?: CashBankingRole;
  bankingMedium?: BankingMedium;
  isVoided?: boolean;
  voidReason?: string;
  voidedAt?: number;
  voidedBy?: string;
  unvoidedAt?: number;
  unvoidedBy?: string;
  movementKind?: MovementKind;
  movementId?: string;
  isJournal?: boolean;
  programmeId?: string;
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
  cashBankingLastReconciliationId?: string;
  cashBankingStatus?: CashBankingStatus;
  createdAt: number;
}

export interface CashBankingReconciliation {
  _id: string;
  organizationId: string;
  cashCollectionIds: string[];
  cashCollectionSplits: {
    cashCollectionId: string;
    cashAmount: number;
    chequeAmount: number;
  }[];
  bankTransactionIds: string[];
  bankTransactionSplits: {
    transactionId: string;
    medium: BankingMedium;
    cashAmount: number;
    chequeAmount: number;
  }[];
  status: "draft" | "completed" | "reopened";
  expectedCashAmount: number;
  expectedChequeAmount: number;
  expectedTotal: number;
  bankedCashAmount: number;
  bankedChequeAmount: number;
  bankedTotal: number;
  varianceAmount: number;
  varianceType?: CashBankingVarianceType;
  varianceNote?: string;
  completedAt?: number;
  completedBy?: string;
  reopenedAt?: number;
  reopenedBy?: string;
  reopenReason?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
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
  movementKind?: MovementKind;
  isRetired?: boolean;
}

export interface Movement {
  _id: string;
  kind: MovementKind;
  note?: string;
  lender?: string;
  dueDate?: string;
  createdAt: number;
}

export interface CategoryGroup {
  mainCategory: string;
  subcategories: { name: string; total: number }[];
  total: number;
}

// Monthly Report Types (RCI Monthly Accounts)
// A loan as it stood at a report period end. Reports need reports.read, which
// leadership holds with donors.read, so the lender name is shown unredacted.
export interface LoanReportRow {
  // The loan movement's id. Two loans from the same lender need distinct keys.
  movementId: string;
  lender: string;
  dueDate?: string;
  borrowed: number;
  repaid: number;
  outstanding: number;
}

// A comparison period's figures, grouped the same way as the report itself.
export interface ReportComparison {
  label: string;           // "August 2026", "September 2025", "2025/26 (6 Apr - 8 Oct)"
  range: DateRange;
  totals: PeriodTotals;
  receipts: CategoryGroup[];
  payments: CategoryGroup[];
}

export interface MonthlyReportData {
  year: number;
  month: number;
  monthName: string;
  period: ReportPeriod;
  receipts: CategoryGroup[];        // Income grouped by mainCategory, largest first
  payments: CategoryGroup[];        // Expenditure grouped by mainCategory, largest first
  weeklyBreakdown: WeeklyBreakdownItem[];
  missionTithe: {
    weeklyBreakdown: MissionTitheItem[];
    total: number;
    titheToPay: number;  // 10% of total
  };
  tithes: TitheBreakdownItem[];
  // Tithes grouped by giver.
  titheGivers: GivingByDonor;
  giftAidSummary: {
    eligible: number;
    claimable: number;
  };
  totals: {
    grossIncome: number;
    totalExpenditure: number;
    netBankable: number;
  };
  comparison: {
    previousMonth: ReportComparison;
    sameMonthLastYear: ReportComparison;
  };
  // Twelve months ending with this one.
  trend: TrendPoint[];
  // The financial year containing this month, through the month's end.
  yearToDate: { label: string; totals: PeriodTotals };
  fundStatement: FundStatement;
  readiness: DataReadiness;
  transfers: TransferSummary;
  loans: LoanReportRow[];
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
  // Start year of the financial year.
  year: number;
  reportingPeriod: 'tax_year' | 'calendar_year';
  period: ReportPeriod;
  receipts: CategoryGroup[];        // largest first
  payments: CategoryGroup[];        // largest first
  // Twelve buckets, with priorIncome from the year before.
  monthlyTrend: TrendPoint[];
  // The same elapsed span one year earlier; null when it has no reportable rows.
  prior: ReportComparison | null;
  giftAidAnnual: {
    totalEligible: number;
    totalClaimable: number;
  };
  missionTithe: {
    eligible: number;
    due: number;
  };
  giving: {
    donorCount: number;
    giftCount: number;
    // Named givers who gave in at least half of the elapsed months (minimum 1).
    regularGivers: number;
  };
  fundStatement: FundStatement;
  reserveCover: ReserveCover;
  readiness: DataReadiness;
  totals: {
    totalIncome: number;
    totalExpenditure: number;
    netMovement: number;
  };
  transfers: TransferSummary;
  loans: LoanReportRow[];
}
