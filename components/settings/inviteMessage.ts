import type { UserRole } from "../../lib/permissions";

// The message a sender copies to someone they've invited. With no link (older invitations), it walks them through signing up.
export function generateInviteMessage(args: {
  churchName: string;
  email: string;
  role: UserRole;
  inviteUrl: string | null;
  origin: string;
  senderName: string;
}) {
  const { churchName, email, role, inviteUrl, origin, senderName } = args;
  const acceptSteps = inviteUrl
    ? `To accept this invitation, open this link and sign up:
${inviteUrl}`
    : `To accept this invitation:
1. Go to ${origin}
2. Sign up or log in using this email address: ${email}
3. Accept the invitation when prompted`;
  return `Hi there!

You've been invited to join ${churchName} on ChurchCoin as a ${role} member.

${acceptSteps}

This invitation expires in 30 days.

See you soon!
${senderName}`;
}

export const buildInviteUrl = (origin: string, token?: string) => (token ? `${origin}/?invite=${token}` : null);
