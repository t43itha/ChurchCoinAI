"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { getInviteEmailConfig } from "../lib/emailConfig";

interface InviteEmailParams {
  email: string;
  role: string;
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
}

interface InviteResult {
  invitationId: string;
  inviteUrl: string;
  emailSent: boolean;
  emailError?: string;
}

function buildInviteUrl(token: string): string {
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}/?invite=${token}`;
}

async function sendInviteEmail(params: InviteEmailParams): Promise<{ sent: boolean; error?: string }> {
  const emailConfig = getInviteEmailConfig();
  if (!emailConfig.configured) {
    return { sent: false, error: emailConfig.error };
  }

  const subject = `You're invited to join ${params.organizationName} on ChurchCoin`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="font-weight: 700;">You've been invited</h2>
      <p>${escapeHtml(params.inviterName)} has invited you to join
        <strong>${escapeHtml(params.organizationName)}</strong> on ChurchCoin
        as a <strong>${escapeHtml(params.role)}</strong> member.</p>
      <p style="margin: 28px 0;">
        <a href="${params.inviteUrl}"
           style="background: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Accept Invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">Or copy this link into your browser:<br/>
        <a href="${params.inviteUrl}">${params.inviteUrl}</a></p>
      <p style="font-size: 13px; color: #666;">This invitation expires in 30 days. If you weren't expecting it, you can ignore this email.</p>
    </div>`;
  const text = `${params.inviterName} has invited you to join ${params.organizationName} on ChurchCoin as a ${params.role} member.\n\nAccept the invitation: ${params.inviteUrl}\n\nThis invitation expires in 30 days. If you weren't expecting it, you can ignore this email.`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emailConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailConfig.from,
        to: [params.email],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Resend API error:", response.status, body);
      // Resend sandbox accounts can only email the account owner until a
      // domain is verified — surface that clearly to the admin
      if (response.status === 403 && body.includes("verify a domain")) {
        return {
          sent: false,
          error:
            "Your Resend account is in test mode and can only email its own address. Verify a domain at resend.com/domains, then set RESEND_FROM_EMAIL to a sender on that domain.",
        };
      }
      return { sent: false, error: `Email delivery failed (${response.status})` };
    }

    return { sent: true };
  } catch (err) {
    console.error("Resend request failed:", err);
    return { sent: false, error: "Email delivery failed (network error)" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Create an invitation and email it to the recipient
export const createAndSend = action({
  args: {
    email: v.string(),
    role: v.union(
      v.literal("Admin"),
      v.literal("Finance Team"),
      v.literal("Pastorate"),
      v.literal("Guest")
    ),
  },
  handler: async (ctx, args): Promise<InviteResult> => {
    const invitation = await ctx.runMutation(api.mutations.invitations.create, {
      email: args.email,
      role: args.role,
    });

    const inviteUrl = buildInviteUrl(invitation.token);
    const result = await sendInviteEmail({
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organizationName,
      inviterName: invitation.inviterName,
      inviteUrl,
    });

    if (result.sent) {
      await ctx.runMutation(api.mutations.invitations.markSent, {
        invitationId: invitation.invitationId,
      });
    }

    return {
      invitationId: invitation.invitationId,
      inviteUrl,
      emailSent: result.sent,
      emailError: result.error,
    };
  },
});

// Re-send an existing invitation (also extends its expiry by 30 days)
export const resend = action({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args): Promise<InviteResult> => {
    const invitation = await ctx.runMutation(api.mutations.invitations.resend, {
      invitationId: args.invitationId,
    });

    const inviteUrl = buildInviteUrl(invitation.token);
    const result = await sendInviteEmail({
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organizationName,
      inviterName: invitation.inviterName,
      inviteUrl,
    });

    if (result.sent) {
      await ctx.runMutation(api.mutations.invitations.markSent, {
        invitationId: args.invitationId,
      });
    }

    return {
      invitationId: args.invitationId,
      inviteUrl,
      emailSent: result.sent,
      emailError: result.error,
    };
  },
});
