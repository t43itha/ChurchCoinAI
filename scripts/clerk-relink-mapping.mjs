/* global process, console, fetch, AbortSignal */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function listClerkUsers(key, fetcher = fetch) {
  const users = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetcher(`https://api.clerk.com/v1/users?limit=100&offset=${offset}&order_by=%2Bcreated_at`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Clerk user listing failed (HTTP ${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Unexpected Clerk user response');
    users.push(...page);
    if (page.length < 100) return users;
  }
}
function verifiedPrimary(user) {
  const primary = user.email_addresses?.find(email => email.id === user.primary_email_address_id);
  return primary?.verification?.status === 'verified' ? primary.email_address.trim().toLowerCase() : null;
}
export function mappingFromUsers(development, production) {
  const source = development.map(verifiedPrimary).filter(Boolean);
  if (new Set(source).size !== source.length) throw new Error('Ambiguous development primary email');
  return source.map(email => {
    const matches = production.filter(user => verifiedPrimary(user) === email);
    if (matches.length !== 1) throw new Error('Missing or ambiguous verified production primary email');
    return { email, clerkId: matches[0].id };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const dev = process.env.CLERK_DEVELOPMENT_SECRET_KEY;
    const prod = process.env.CLERK_PRODUCTION_SECRET_KEY;
    if (!dev?.startsWith('sk_test_') || !prod?.startsWith('sk_live_')) throw new Error('Set CLERK_DEVELOPMENT_SECRET_KEY and CLERK_PRODUCTION_SECRET_KEY');
    const mapping = mappingFromUsers(await listClerkUsers(dev), await listClerkUsers(prod));
    await writeFile(process.argv[2] || 'clerk-relink-mapping.json', JSON.stringify(mapping, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Wrote ${mapping.length} verified mappings. Review against the Convex user inventory before relinking.`);
  } catch (error) { console.error(error instanceof Error ? error.message : 'Mapping failed'); process.exitCode = 1; }
}
