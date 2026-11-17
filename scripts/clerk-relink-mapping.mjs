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
// The relink mutation matches these emails against Convex users and refuses any it
// does not know, so the production instance alone is enough to build the mapping.
export function mappingFromUsers(production) {
  const mapping = production.flatMap(user => {
    const email = verifiedPrimary(user);
    return email ? [{ email, clerkId: user.id }] : [];
  });
  if (new Set(mapping.map(entry => entry.email)).size !== mapping.length) throw new Error('Two production accounts share a verified primary email');
  return mapping;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const prod = process.env.CLERK_PRODUCTION_SECRET_KEY;
    if (!prod?.startsWith('sk_live_')) throw new Error('Set CLERK_PRODUCTION_SECRET_KEY to the production instance secret key');
    const mapping = mappingFromUsers(await listClerkUsers(prod));
    await writeFile(process.argv[2] || 'clerk-relink-mapping.json', JSON.stringify(mapping, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Wrote ${mapping.length} verified mappings. Review against the Convex user inventory before relinking.`);
  } catch (error) { console.error(error instanceof Error ? error.message : 'Mapping failed'); process.exitCode = 1; }
}
