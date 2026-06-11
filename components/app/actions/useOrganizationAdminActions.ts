import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  ChurchDetails,
  InvitationCreateInput,
  InvitationSendResult,
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
  const createAndSendInvitation = useAction(api.actions.invitations.createAndSend);
  const resendInvitation = useAction(api.actions.invitations.resend);
  const cancelInvitation = useMutation(api.mutations.invitations.cancel);
  const updateOrganization = useMutation(api.mutations.organizations.update);

  const handleInviteUser = async (
    invitation: InvitationCreateInput
  ): Promise<InvitationSendResult | null> => {
    try {
      const result = await createAndSendInvitation({
        email: invitation.email,
        role: invitation.role,
      });
      if (result.emailSent) {
        showNotification(
          "Invitation Emailed",
          `An invitation email has been sent to ${invitation.email}.`
        );
      } else {
        showNotification(
          "Invitation Created",
          `The email could not be sent — copy the invite link and share it with ${invitation.email}.`
        );
      }
      return result;
    } catch (error: any) {
      console.error("Failed to invite user:", error);
      showNotification(
        "Error",
        error.message || "Failed to create invitation. Please try again."
      );
      return null;
    }
  };

  const handleResendInvitation = async (
    invitationId: string
  ): Promise<InvitationSendResult | null> => {
    try {
      const result = await resendInvitation({
        invitationId: invitationId as Id<"invitations">,
      });
      if (result.emailSent) {
        showNotification(
          "Invitation Resent",
          "The invitation email has been sent again and its expiry extended by 30 days."
        );
      } else {
        showNotification(
          "Invitation Extended",
          "Expiry extended by 30 days, but the email could not be sent — copy the link and share it."
        );
      }
      return result;
    } catch (error: any) {
      console.error("Failed to resend invitation:", error);
      showNotification(
        "Error",
        error.message || "Failed to resend invitation. Please try again."
      );
      return null;
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
    handleResendInvitation,
    handleCancelInvitation,
    handleUpdateUserRole,
    handleUpdateChurchDetails,
  };
};
