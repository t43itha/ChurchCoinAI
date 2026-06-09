import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import LoadingSpinner from "../LoadingSpinner";
import {
  AppUser,
  Category,
  ChurchDetails,
  Donor,
  DonorCreateInput,
  Fund,
  FundCreateInput,
  Invitation,
  InvitationCreateInput,
  Pledge,
  PledgeCreateInput,
  Transaction,
  UserRole,
} from "../../types";

const Dashboard = lazy(() => import("../Dashboard"));
const TransactionManager = lazy(() => import("../TransactionManager"));
const FundManager = lazy(() => import("../FundManager"));
const DonorManager = lazy(() => import("../DonorManager"));
const Campaigns = lazy(() => import("../Campaigns"));
const Reports = lazy(() => import("../Reports"));
const AICoPilot = lazy(() => import("../AICoPilot"));
const Settings = lazy(() => import("../Settings"));

interface AppContentRoutesProps {
  currentUser: AppUser;
  churchDetails: ChurchDetails;
  funds: Fund[];
  transactions: Transaction[];
  pledges: Pledge[];
  donors: Donor[];
  categories: Category[];
  users: AppUser[];
  pendingInvitations: Invitation[];
  isTransactionsLoading: boolean;
  isPledgesLoading: boolean;
  isDonorsLoading: boolean;
  isUsersLoading: boolean;
  isInvitationsLoading: boolean;
  onViewFundLedger: (fundId: string) => void;
  onPledgeCompleted: (donorName: string, amount: number) => void;
  onAddDonor: (donor: DonorCreateInput) => Promise<string | undefined>;
  onUpdateDonor: (donor: Donor) => void;
  onAddPledge: (pledge: PledgeCreateInput) => void;
  onUpdatePledge: (pledge: Pledge) => void;
  onBulkAddPledges: (pledgesToAdd: PledgeCreateInput[]) => void;
  onBulkAddDonors: (
    donorsToAdd: DonorCreateInput[]
  ) => Promise<{ id: string; name: string; isNew: boolean }[]>;
  onUpdateTransaction: (transaction: Transaction) => void;
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onAddCategory: (categoryName: string) => void;
  onRemoveCategory: (categoryName: string) => void;
  onInviteUser: (invitation: InvitationCreateInput) => void;
  onCancelInvitation: (invitationId: string) => void;
  onUpdateChurchDetails: (details: ChurchDetails) => void;
  onAddFund: (fund: FundCreateInput) => void;
  onUpdateFund: (fund: Fund) => void;
  onRemoveFund: (fundId: string) => void;
}

const TransactionsRoute: React.FC<{
  funds: Fund[];
  pledges: Pledge[];
  categories: Category[];
  currentUser: AppUser;
  onPledgeCompleted: (donorName: string, amount: number) => void;
}> = ({ funds, pledges, categories, currentUser, onPledgeCompleted }) => {
  const [searchParams] = useSearchParams();
  const initialFundId = searchParams.get("fundId") ?? undefined;

  return (
    <TransactionManager
      funds={funds}
      pledges={pledges}
      categories={categories}
      currentUser={currentUser}
      initialFundId={initialFundId}
      onPledgeCompleted={onPledgeCompleted}
    />
  );
};

const AppContentRoutes: React.FC<AppContentRoutesProps> = (props) => {
  const financialDataLoader = <LoadingSpinner message="Loading financial data..." />;

  return (
    <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <Dashboard
              funds={props.funds}
              categories={props.categories}
              currentUser={props.currentUser}
            />
          }
        />
        <Route
          path="/transactions"
          element={
            props.isPledgesLoading ? (
              financialDataLoader
            ) : (
              <TransactionsRoute
                funds={props.funds}
                pledges={props.pledges}
                categories={props.categories}
                currentUser={props.currentUser}
                onPledgeCompleted={props.onPledgeCompleted}
              />
            )
          }
        />
        <Route
          path="/funds"
          element={
            props.isTransactionsLoading ? (
              financialDataLoader
            ) : (
              <FundManager
                funds={props.funds}
                transactions={props.transactions}
                onViewLedger={props.onViewFundLedger}
              />
            )
          }
        />
        <Route
          path="/donors"
          element={
            props.isDonorsLoading ||
            props.isTransactionsLoading ||
            props.isPledgesLoading ? (
              financialDataLoader
            ) : (
              <DonorManager
                donors={props.donors}
                transactions={props.transactions}
                pledges={props.pledges}
                funds={props.funds}
                onAddDonor={props.onAddDonor}
                onUpdateDonor={props.onUpdateDonor}
                onAddPledge={props.onAddPledge}
                onUpdatePledge={props.onUpdatePledge}
                onUpdateTransaction={props.onUpdateTransaction}
                currentUser={props.currentUser}
                churchDetails={props.churchDetails}
              />
            )
          }
        />
        <Route
          path="/campaigns"
          element={
            props.isPledgesLoading ||
            props.isTransactionsLoading ||
            props.isDonorsLoading ? (
              financialDataLoader
            ) : (
              <Campaigns
                funds={props.funds}
                pledges={props.pledges}
                transactions={props.transactions}
                donors={props.donors}
                onAddPledge={props.onAddPledge}
                onUpdatePledge={props.onUpdatePledge}
                onBulkAddPledges={props.onBulkAddPledges}
                onBulkAddDonors={props.onBulkAddDonors}
                onUpdateTransaction={props.onUpdateTransaction}
                currentUser={props.currentUser}
                onPledgeCompleted={props.onPledgeCompleted}
              />
            )
          }
        />
        <Route
          path="/reports"
          element={
            props.isTransactionsLoading || props.isPledgesLoading ? (
              financialDataLoader
            ) : (
              <Reports
                transactions={props.transactions}
                funds={props.funds}
                pledges={props.pledges}
                churchDetails={props.churchDetails}
              />
            )
          }
        />
        <Route path="/copilot" element={<AICoPilot />} />
        <Route
          path="/settings"
          element={
            props.isUsersLoading || props.isInvitationsLoading ? (
              <LoadingSpinner message="Loading settings data..." />
            ) : (
              <Settings
                currentUser={props.currentUser}
                users={props.users}
                categories={props.categories.map((category) => category.name)}
                funds={props.funds}
                churchDetails={props.churchDetails}
                pendingInvitations={props.pendingInvitations}
                onUpdateUserRole={props.onUpdateUserRole}
                onAddCategory={props.onAddCategory}
                onRemoveCategory={props.onRemoveCategory}
                onInviteUser={props.onInviteUser}
                onCancelInvitation={props.onCancelInvitation}
                onUpdateChurchDetails={props.onUpdateChurchDetails}
                onAddFund={props.onAddFund}
                onUpdateFund={props.onUpdateFund}
                onRemoveFund={props.onRemoveFund}
              />
            )
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppContentRoutes;
