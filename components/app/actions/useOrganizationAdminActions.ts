import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  ChurchDetails,
  InvitationCreateInput,
  UserRole,
} from "../../../types";
import { ShowNotification } from "./types";

interface UseOrganizationAdminActionsArgs {
  showNotification: ShowNotification;
}

export const useOrganizationAdminActions = ({
  showNotification,
}: UseOrganizationAdminActionsArgs) => {
  const updateUserRole = useMutation(api.mutations.users.updateRole);
  const createInvitation = useMutation(api.mutations.invitations.create);
  const cancelInvitation = useMutation(api.mutations.invitations.cancel);
  const updateOrganization = useMutation(api.mutations.organizations.update);

  const handleInviteUser = async (invitation: InvitationCreateInput) => {
    try {
      await createInvitation({
        email: invitation.email,
        role: invitation.role,
      });
      showNotification(
        "Invitation Sent",
        `An invitation has been sent to ${invitation.email}.`
      );
    } catch (error: any) {
      console.error("Failed to invite user:", error);
      showNotification(
        "Error",
        error.message || "Failed to send invitation. Please try again."
      );
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await cancelInvitation({
        invitationId: invitationId as Id<"invitations">,
      });
      showNotification("Invitation Cancelled", "The invitation has been cancelled.");
    } catch (error: any) {
      console.error("Failed to cancel invitation:", error);
      showNotification(
        "Error",
        error.message || "Failed to cancel invitation. Please try again."
      );
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole({
        userId: userId as Id<"users">,
        role: newRole,
      });
      showNotification("Role Updated", "User role has been updated.");
    } catch (error: any) {
      console.error("Failed to update user role:", error);
      showNotification(
        "Error",
        error.message || "Failed to update user role. Please try again."
      );
    }
  };

  const handleUpdateChurchDetails = async (details: ChurchDetails) => {
    try {
      await updateOrganization({
        name: details.name,
        charityNumber: details.charityNumber,
        address: details.address,
        email: details.email,
        website: details.website,
        reportingPeriod: details.reportingPeriod,
        logoUrl: details.logoUrl,
      });
      showNotification(
        "Organization Updated",
        "Organization details have been saved."
      );
    } catch (error) {
      console.error("Failed to update organization:", error);
      showNotification("Error", "Failed to update organization. Please try again.");
    }
  };

  return {
    handleInviteUser,
    handleCancelInvitation,
    handleUpdateUserRole,
    handleUpdateChurchDetails,
  };
};
