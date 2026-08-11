export type InviteEmailConfig =
  | { configured: true; apiKey: string; from: string }
  | { configured: false; error: string };

const extractEmailAddress = (sender: string) => {
  const angleAddress = sender.match(/<([^<>]+)>\s*$/)?.[1];
  return (angleAddress ?? sender).trim().toLowerCase();
};

export function getInviteEmailConfig(
  env?: Partial<Record<"RESEND_API_KEY" | "RESEND_FROM_EMAIL", string>>
): InviteEmailConfig {
  const source = env ?? {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  };
  const apiKey = source.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      error: "Email delivery is not configured (missing RESEND_API_KEY)",
    };
  }

  const from = source.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    return {
      configured: false,
      error:
        "Email delivery is disabled until RESEND_FROM_EMAIL is set to a sender on a verified Resend domain.",
    };
  }

  const address = extractEmailAddress(from);
  const domain = address.split("@")[1];
  if (!domain || domain === "resend.dev") {
    return {
      configured: false,
      error:
        "RESEND_FROM_EMAIL must use a verified custom domain; resend.dev test senders cannot deliver invitations to pilot users.",
    };
  }

  return { configured: true, apiKey, from };
}
