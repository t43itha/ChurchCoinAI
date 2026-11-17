type Env = Record<string, string | undefined>;
export function launchProblems(env: Env): string[] {
  const provider = env.CATEGORIZATION_AI_PROVIDER?.trim().toLowerCase() || 'gemini';
  const aiKey = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  const problems = new Set(['CLERK_JWT_ISSUER_DOMAIN', 'APP_BASE_URL', aiKey, 'RESEND_API_KEY', 'RESEND_FROM_EMAIL'].filter(name => !env[name]?.trim()));
  if (!['gemini', 'openrouter', 'openai'].includes(provider)) problems.add('CATEGORIZATION_AI_PROVIDER');
  try {
    const issuer = new URL(env.CLERK_JWT_ISSUER_DOMAIN || '');
    if (issuer.protocol !== 'https:' || /(^|\.)clerk\.accounts\.dev$/i.test(issuer.hostname)) problems.add('CLERK_JWT_ISSUER_DOMAIN');
  } catch { problems.add('CLERK_JWT_ISSUER_DOMAIN'); }
  try { if (new URL(env.APP_BASE_URL || '').protocol !== 'https:') problems.add('APP_BASE_URL'); }
  catch { problems.add('APP_BASE_URL'); }
  if (/@(?:[^@\s<>]+\.)?resend\.dev(?:>|\s|$)/i.test(env.RESEND_FROM_EMAIL || '')) problems.add('RESEND_FROM_EMAIL');
  return [...problems];
}

export type RelinkUser = { _id: string; email: string; clerkId: string };
export type RelinkMapping = { email: string; clerkId: string };
export function planClerkRelink(users: RelinkUser[], mapping: RelinkMapping[]) {
  const emails = new Set<string>();
  const targets = new Set<string>();
  return mapping.map(entry => {
    const email = entry.email.trim().toLowerCase();
    const clerkId = entry.clerkId.trim();
    if (!email || !/^user_[A-Za-z0-9]+$/.test(clerkId) || emails.has(email) || targets.has(clerkId)) throw new Error('Invalid or duplicate relink entry');
    emails.add(email); targets.add(clerkId);
    const matches = users.filter(user => user.email.trim().toLowerCase() === email);
    if (matches.length !== 1) throw new Error('Relink email is unknown or ambiguous');
    const user = matches[0];
    if (users.some(other => other._id !== user._id && (other.clerkId === clerkId || other.clerkId === user.clerkId))) throw new Error('Clerk id is owned by another user');
    return { email, userId: user._id, before: user.clerkId, after: clerkId };
  });
}
