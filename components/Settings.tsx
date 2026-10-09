import { useEffect, useState, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { ChevronRight, CreditCard, Building2, Gift, Landmark, ShieldAlert, ShieldCheck, Tag, Users, Wallet, type LucideIcon } from "lucide-react";
import { api } from "../convex/_generated/api";
import { PLANS } from "../lib/plans";
import { can, type UserRole } from "../lib/permissions";
import { isGiftAidEnabled } from "../lib/giftAid";
import { FundType, type AppUser, type Category, type ChurchDetails, type Fund, type FundCreateInput, type Invitation, type InvitationCreateInput, type InvitationSendResult } from "../types";
import BankConnectionsSettings from "./BankConnectionsSettings";
import BillingSettings from "./BillingSettings";
import DataPrivacySettings from "./DataPrivacySettings";
import ChurchDetailsSheet from "./settings/ChurchDetailsSheet";
import CategoriesSheet from "./settings/CategoriesSheet";
import FundFormSheet from "./settings/FundFormSheet";
import FundsSheet from "./settings/FundsSheet";
import GiftAidSheet from "./settings/GiftAidSheet";
import InviteWalkthrough from "./settings/InviteWalkthrough";
import PeopleSheet from "./settings/PeopleSheet";
import {
  SETTINGS_GROUPS,
  searchWithoutTab,
  settingsRowsFor,
  sheetForSearch,
  type SettingsGroup,
  type SettingsSheetId,
} from "./settings/settingsRows";
import HubHeader from "./hub/HubHeader";
import SectionTitle from "./hub/SectionTitle";
import { nextIcon, nextItem, tagAmber } from "./wizard/ui";

// "fund" and "invite" are sheets opened from another sheet; closing them returns to that one.
type Sheet = SettingsSheetId | "fund" | "invite";

const ROW_ICONS: Record<SettingsSheetId, LucideIcon> = {
  church: Building2,
  "gift-aid": Gift,
  funds: Wallet,
  categories: Tag,
  people: Users,
  bank: Landmark,
  billing: CreditCard,
  privacy: ShieldCheck,
};

const GROUP_TONE: Record<SettingsGroup, string> = {
  Church: "bg-grey-light text-ink",
  Team: "bg-sage-light text-sage",
  Money: "bg-grey-light text-ink",
  Account: "bg-grey-light text-ink",
};

interface SettingsProps {
  currentUser: AppUser;
  users: AppUser[];
  funds: Fund[];
  categories: Category[];
  churchDetails: ChurchDetails;
  pendingInvitations: Invitation[];
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onAddCategory: (
    category: string,
    transactionType: "Income" | "Expenditure"
  ) => void;
  onRemoveCategory: (category: string) => void;
  onSetCategoryRetired: (categoryId: string, retired: boolean) => void;
  onInviteUser: (invitation: InvitationCreateInput) => Promise<InvitationSendResult | null>;
  onResendInvitation: (invitationId: string) => Promise<InvitationSendResult | null>;
  onCancelInvitation: (invitationId: string) => void;
  onUpdateChurchDetails: (details: ChurchDetails) => void;
  onAddFund: (fund: FundCreateInput) => void;
  onUpdateFund: (fund: Fund) => void;
  onRemoveFund: (fundId: string) => void;
}

// The settings hub: grouped rows, each opening one sheet. Deep links such as ?tab=billing open the matching sheet.
const Settings: FC<SettingsProps> = ({
  currentUser,
  users,
  funds,
  categories,
  churchDetails,
  pendingInvitations,
  onUpdateUserRole,
  onAddCategory,
  onRemoveCategory,
  onSetCategoryRetired,
  onInviteUser,
  onResendInvitation,
  onCancelInvitation,
  onUpdateChurchDetails,
  onAddFund,
  onUpdateFund,
  onRemoveFund,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useQuery(api.queries.subscriptions.access);
  const [sheet, setSheet] = useState<Sheet | null>(() => sheetForSearch(location.search, currentUser.role));
  const [fundDraft, setFundDraft] = useState<Partial<Fund>>({});

  useEffect(() => {
    const requested = sheetForSearch(location.search, currentUser.role);
    if (requested) setSheet(requested);
  }, [currentUser.role, location.search]);

  if (!can(currentUser.role, "settings.view")) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center text-grey-mid">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-ledger bg-grey-light text-grey-mid">
          <ShieldAlert size={32} strokeWidth={1.7} />
        </div>
        <h2 className="mb-2 text-lg font-bold text-ink">Restricted access</h2>
        <p className="max-w-sm text-center text-sm">System configuration is restricted to Administrators and Finance Team members.</p>
      </div>
    );
  }

  // Closing also clears a consumed ?tab=, otherwise clicking the same deep link again changes nothing and stays closed.
  const close = () => {
    setSheet(null);
    const search = searchWithoutTab(location.search);
    if (search !== location.search) navigate({ pathname: location.pathname, search }, { replace: true });
  };
  const planName = PLANS.find((plan) => plan.id === access?.plan)?.name;
  const rows = settingsRowsFor(currentUser.role);

  const detailFor: Record<SettingsSheetId, string> = {
    church: "Name, address and contact details",
    "gift-aid": isGiftAidEnabled(churchDetails) ? "On" : "Off",
    funds: `${funds.length} ${funds.length === 1 ? "fund" : "funds"}`,
    categories: `${categories.length} ${categories.length === 1 ? "category" : "categories"}`,
    people: `${users.length} active`,
    bank: "Accounts used to sync transactions",
    billing: "Plan, payment and renewal",
    privacy: "Export or delete your records",
  };

  const openFundForm = (fund: Partial<Fund>) => {
    setFundDraft(fund);
    setSheet("fund");
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-7 pb-24">
      <HubHeader
        title="Settings"
        status={planName ? `${churchDetails.name} · ${planName} plan` : churchDetails.name}
      />

      {SETTINGS_GROUPS.map((group) => {
        const groupRows = rows.filter((row) => row.group === group);
        if (groupRows.length === 0) return null;
        return (
          <section key={group} aria-label={group} className="space-y-2.5">
            <SectionTitle>{group}</SectionTitle>
            <div className="grid gap-2">
              {groupRows.map((row) => {
                const Icon = ROW_ICONS[row.id];
                const waiting = row.id === "people" ? pendingInvitations.length : 0;
                return (
                  <button key={row.id} type="button" onClick={() => setSheet(row.id)} className={nextItem}>
                    <span className={`${nextIcon} ${GROUP_TONE[group]}`}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14.5px] text-ink">{row.title}</b>
                      <span className="block text-xs text-grey-mid">{detailFor[row.id]}</span>
                    </span>
                    {waiting > 0 ? (
                      <span className={tagAmber}>{waiting} waiting</span>
                    ) : (
                      <ChevronRight size={18} className="shrink-0 text-grey-mid" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {sheet === "church" && (
        <ChurchDetailsSheet
          churchDetails={churchDetails}
          canEdit={can(currentUser.role, "organization.update")}
          onSave={onUpdateChurchDetails}
          onClose={close}
        />
      )}

      {sheet === "gift-aid" && (
        <GiftAidSheet
          churchDetails={churchDetails}
          canEdit={can(currentUser.role, "organization.update")}
          onSave={(details) => {
            onUpdateChurchDetails(details);
            close();
          }}
          onClose={close}
        />
      )}

      {sheet === "funds" && (
        <FundsSheet
          currentUser={currentUser}
          funds={funds}
          onNewFund={() => openFundForm({ type: FundType.UNRESTRICTED })}
          onEditFund={(fund) => openFundForm(fund)}
          onRemoveFund={onRemoveFund}
          onClose={close}
        />
      )}

      {sheet === "fund" && (
        <FundFormSheet
          fund={fundDraft}
          categories={categories}
          onChange={setFundDraft}
          onAddFund={onAddFund}
          onUpdateFund={onUpdateFund}
          onClose={() => setSheet("funds")}
        />
      )}

      {sheet === "categories" && (
        <CategoriesSheet
          currentUser={currentUser}
          categories={categories}
          onAddCategory={onAddCategory}
          onRemoveCategory={onRemoveCategory}
          onSetCategoryRetired={onSetCategoryRetired}
          onClose={close}
        />
      )}

      {sheet === "people" && (
        <PeopleSheet
          currentUser={currentUser}
          churchName={churchDetails.name}
          users={users}
          pendingInvitations={pendingInvitations}
          onUpdateUserRole={onUpdateUserRole}
          onResendInvitation={onResendInvitation}
          onCancelInvitation={onCancelInvitation}
          onInvite={() => setSheet("invite")}
          onClose={close}
        />
      )}

      {sheet === "invite" && can(currentUser.role, "invitations.manage") && (
        <InviteWalkthrough
          churchName={churchDetails.name}
          senderName={currentUser.name}
          onInviteUser={onInviteUser}
          onClose={() => setSheet("people")}
        />
      )}

      {sheet === "bank" && <BankConnectionsSettings funds={funds} currentUser={currentUser} onClose={close} />}

      {sheet === "billing" && can(currentUser.role, "billing.manage") && <BillingSettings onClose={close} />}

      {sheet === "privacy" && can(currentUser.role, "organization.export") && (
        <DataPrivacySettings organizationName={churchDetails.name} onClose={close} />
      )}
    </div>
  );
};

export default Settings;
