import React, { Suspense, lazy } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import LoadingSpinner from "../LoadingSpinner";
import { notify } from "../../lib/notifications";
import { useDonorPledgeActions } from "./actions/useDonorPledgeActions";
import { useFundCategoryActions } from "./actions/useFundCategoryActions";
import { useOrganizationAdminActions } from "./actions/useOrganizationAdminActions";
import {
  AppUser,
  Category,
  ChurchDetails,
  Fund,
  Invitation,
} from "../../types";

const Dashboard = lazy(() => import("../Dashboard"));
const TransactionManager = lazy(() => import("../TransactionManager"));
const FundManager = lazy(() => import("../FundManager"));
const DonorManager = lazy(() => import("../DonorManager"));
const Campaigns = lazy(() => import("../Campaigns"));
const Reports = lazy(() => import("../Reports"));
const AICoPilot = lazy(() => import("../AICoPilot"));
const Settings = lazy(() => import("../Settings"));

// Shared context every route needs; route-specific data (transactions,
// donors, pledges, users) is fetched by each route so only the active
// page subscribes to it.
interface RouteContext {
  currentUser: AppUser;
  churchDetails: ChurchDetails;
  funds: Fund[];
  categories: Category[];
}

const financialDataLoader = (
  <LoadingSpinner message="Loading financial data..." />
);

const handlePledgeCompleted = (donorName: string, amount: number) => {
  notify(
    "Pledge Fulfilled!",
    `${donorName} has completed their goal of £${amount.toLocaleString()}.`
  );
};

const TransactionsRoute: React.FC<RouteContext> = ({
  funds,
  categories,
  currentUser,
}) => {
  const [searchParams] = useSearchParams();
  const initialFundId = searchParams.get("fundId") ?? undefined;
  const pledges = useQuery(api.queries.pledges.list, {});

  if (pledges === undefined) return financialDataLoader;

  return (
    <TransactionManager
      funds={funds}
      pledges={pledges}
      categories={categories}
      currentUser={currentUser}
      initialFundId={initialFundId}
      onPledgeCompleted={handlePledgeCompleted}
    />
  );
};

const FundsRoute: React.FC<RouteContext> = ({ funds }) => {
  const navigate = useNavigate();
  const transactions = useQuery(api.queries.transactions.list, {});

  if (transactions === undefined) return financialDataLoader;

  return (
    <FundManager
      funds={funds}
      transactions={transactions}
      onViewLedger={(fundId) =>
        navigate(`/transactions?fundId=${encodeURIComponent(fundId)}`)
      }
    />
  );
};

const DonorsRoute: React.FC<RouteContext> = ({
  funds,
  currentUser,
  churchDetails,
}) => {
  const donors = useQuery(api.queries.donors.list, {});
  const transactions = useQuery(api.queries.transactions.list, {});
  const pledges = useQuery(api.queries.pledges.list, {});
  const actions = useDonorPledgeActions({ showNotification: notify });

  if (
    donors === undefined ||
    transactions === undefined ||
    pledges === undefined
  ) {
    return financialDataLoader;
  }

  return (
    <DonorManager
      donors={donors}
      transactions={transactions}
      pledges={pledges}
      funds={funds}
      onAddDonor={actions.handleAddDonor}
      onUpdateDonor={actions.handleUpdateDonor}
      onAddPledge={actions.handleAddPledge}
      onUpdatePledge={actions.handleUpdatePledge}
      onUpdateTransaction={actions.handleUpdateTransaction}
      currentUser={currentUser}
      churchDetails={churchDetails}
    />
  );
};

const CampaignsRoute: React.FC<RouteContext> = ({ funds, currentUser }) => {
  const pledges = useQuery(api.queries.pledges.list, {});
  const transactions = useQuery(api.queries.transactions.list, {});
  const donors = useQuery(api.queries.donors.list, {});
  const actions = useDonorPledgeActions({ showNotification: notify });

  if (
    pledges === undefined ||
    transactions === undefined ||
    donors === undefined
  ) {
    return financialDataLoader;
  }

  return (
    <Campaigns
      funds={funds}
      pledges={pledges}
      transactions={transactions}
      donors={donors}
      onAddPledge={actions.handleAddPledge}
      onUpdatePledge={actions.handleUpdatePledge}
      onBulkAddPledges={actions.handleBulkAddPledges}
      onBulkAddDonors={actions.handleBulkAddDonors}
      onUpdateTransaction={actions.handleUpdateTransaction}
      currentUser={currentUser}
      onPledgeCompleted={handlePledgeCompleted}
    />
  );
};

const ReportsRoute: React.FC<RouteContext> = ({ funds, churchDetails }) => {
  const transactions = useQuery(api.queries.transactions.list, {});
  const pledges = useQuery(api.queries.pledges.list, {});

  if (transactions === undefined || pledges === undefined) {
    return financialDataLoader;
  }

  return (
    <Reports
      transactions={transactions}
      funds={funds}
      pledges={pledges}
      churchDetails={churchDetails}
    />
  );
};

const SettingsRoute: React.FC<RouteContext> = ({
  currentUser,
  churchDetails,
  funds,
  categories,
}) => {
  const users = useQuery(api.queries.users.listByOrganization, {});
  const pendingInvitations = useQuery(api.queries.invitations.listPending, {});
  const adminActions = useOrganizationAdminActions({
    showNotification: notify,
  });
  const fundCategoryActions = useFundCategoryActions({
    categories,
    showNotification: notify,
  });

  if (users === undefined || pendingInvitations === undefined) {
    return <LoadingSpinner message="Loading settings data..." />;
  }

  return (
    <Settings
      currentUser={currentUser}
      users={users}
      categories={categories.map((category) => category.name)}
      funds={funds}
      churchDetails={churchDetails}
      pendingInvitations={pendingInvitations as Invitation[]}
      onUpdateUserRole={adminActions.handleUpdateUserRole}
      onAddCategory={fundCategoryActions.handleAddCategory}
      onRemoveCategory={fundCategoryActions.handleRemoveCategory}
      onInviteUser={adminActions.handleInviteUser}
      onResendInvitation={adminActions.handleResendInvitation}
      onCancelInvitation={adminActions.handleCancelInvitation}
      onUpdateChurchDetails={adminActions.handleUpdateChurchDetails}
      onAddFund={fundCategoryActions.handleAddFund}
      onUpdateFund={fundCategoryActions.handleUpdateFund}
      onRemoveFund={fundCategoryActions.handleRemoveFund}
    />
  );
};

const AppContentRoutes: React.FC<RouteContext> = (context) => {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <Dashboard
              funds={context.funds}
              categories={context.categories}
              currentUser={context.currentUser}
            />
          }
        />
        <Route path="/transactions" element={<TransactionsRoute {...context} />} />
        <Route path="/funds" element={<FundsRoute {...context} />} />
        <Route path="/donors" element={<DonorsRoute {...context} />} />
        <Route path="/campaigns" element={<CampaignsRoute {...context} />} />
        <Route path="/reports" element={<ReportsRoute {...context} />} />
        <Route path="/copilot" element={<AICoPilot />} />
        <Route path="/settings" element={<SettingsRoute {...context} />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppContentRoutes;
