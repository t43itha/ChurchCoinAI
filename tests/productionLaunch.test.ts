import { describe, expect, it } from 'vitest';
import { buildDecision, productionUrl } from '../scripts/vercel-build.mjs';
import { clerkFrontendHost, contentSecurityPolicy } from '../lib/contentSecurityPolicy';
import { launchProblems, planClerkRelink } from '../convex/lib/productionLaunch';
import { listClerkUsers, mappingFromUsers } from '../scripts/clerk-relink-mapping.mjs';
import { relinkClerkIds } from '../convex/mutations/maintenance';
import type { MutationCtx } from '../convex/_generated/server';

describe('production build gate', () => {
  const valid = { VERCEL_ENV: 'production', REQUIRE_PRODUCTION_KEYS: '1', CONVEX_DEPLOY_KEY: 'prod:valuable-akita-907|fixture', VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture' };
  it('keeps local and preview builds plain, even with strict flags and keys', () => {
    for (const VERCEL_ENV of [undefined, 'preview', 'development']) expect(buildDecision({ ...valid, VERCEL_ENV }).command).toBe('npm run build');
  });
  it('keeps the current live wiring plain with one warning', () => {
    const result = buildDecision({ VERCEL_ENV: 'production', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', VITE_CONVEX_URL: 'https://efficient-dogfish-623.convex.cloud' });
    expect(result.command).toBe('npm run build'); expect(result.warning).toContain('WARNING');
  });
  it('couples production deploy and build', () => {
    expect(buildDecision(valid).command).toBe('npx convex deploy --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL');
    expect(buildDecision({ ...valid, VITE_CONVEX_URL: productionUrl }).refusal).toBeUndefined();
  });
  it('refuses missing, development, preview, project and wrong-deployment keys', () => {
    for (const CONVEX_DEPLOY_KEY of ['', 'dev:valuable-akita-907|fixture', 'preview:team:project|fixture', 'project:team:project|fixture', 'prod:other-123|fixture']) expect(buildDecision({ ...valid, CONVEX_DEPLOY_KEY }).refusal).toBeTruthy();
    expect(buildDecision({ ...valid, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' }).refusal).toBeTruthy();
    expect(buildDecision({ ...valid, VITE_CONVEX_URL: 'https://efficient-dogfish-623.convex.cloud' }).refusal).toBeTruthy();
  });
});
describe('Clerk CSP', () => {
  it.each(['test', 'live'])('decodes %s keys safely', mode => {
    const host = mode === 'live' ? 'clerk.churchcoin.co.uk' : 'example.clerk.accounts.dev';
    const key = `pk_${mode}_${btoa(host + '$')}`;
    expect(clerkFrontendHost(key)).toBe(host);
    for (const directive of ['script-src', 'connect-src', 'frame-src']) expect(contentSecurityPolicy(key).split(';').find(part => part.trim().startsWith(directive))).toContain(`https://${host}`);
  });
  it('falls back on malformed keys and prevents policy injection', () => {
    for (const key of ['', 'pk_test_ci_placeholder', 'pk_live_' + btoa("evil.com; script-src *$"), 'pk_live_' + btoa('clerk.churchcoin.co.uk')]) {
      expect(clerkFrontendHost(key)).toBeNull();
      expect(contentSecurityPolicy(key)).toContain('https://*.clerk.accounts.dev');
    }
    expect(contentSecurityPolicy()).not.toContain('frame-ancestors');
    expect(contentSecurityPolicy()).toContain('wss://*.convex.cloud');
    expect(contentSecurityPolicy()).toContain('https://*.ingest.sentry.io');
  });
});
describe('preflight', () => {
  const env = { CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.churchcoin.co.uk', APP_BASE_URL: 'https://www.churchcoin.co.uk', GEMINI_API_KEY: 'secret', GOOGLE_GENERATIVE_AI_API_KEY: 'secret', RESEND_API_KEY: 'secret', RESEND_FROM_EMAIL: 'ChurchCoin <hello@churchcoin.co.uk>' };
  it('needs no billing or bank secrets', () => expect(launchProblems(env)).toEqual([]));
  it('selects provider keys and reports names only', () => {
    expect(launchProblems({ ...env, CATEGORIZATION_AI_PROVIDER: 'openai' })).toEqual(['OPENAI_API_KEY']);
    expect(launchProblems({ ...env, CATEGORIZATION_AI_PROVIDER: 'openrouter' })).toEqual(['OPENROUTER_API_KEY']);
    // Reports, Smart Link and chat call Gemini, and AI search embeds through @ai-sdk/google,
    // whatever provider categorises.
    const openrouter = { ...env, CATEGORIZATION_AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' };
    expect(launchProblems({ ...openrouter, GEMINI_API_KEY: '' })).toEqual(['GEMINI_API_KEY']);
    expect(launchProblems({ ...openrouter, GOOGLE_GENERATIVE_AI_API_KEY: '' })).toEqual(['GOOGLE_GENERATIVE_AI_API_KEY']);
    expect(launchProblems({ ...env, GEMINI_API_KEY: ' ' })).toEqual(['GEMINI_API_KEY']);
    expect(launchProblems({ ...env, CLERK_JWT_ISSUER_DOMAIN: 'https://foo.clerk.accounts.dev', APP_BASE_URL: 'http://localhost', RESEND_FROM_EMAIL: 'Test <onboarding@resend.dev>' }).sort()).toEqual(['APP_BASE_URL', 'CLERK_JWT_ISSUER_DOMAIN', 'RESEND_FROM_EMAIL']);
  });
});
describe('relink planning', () => {
  const users = [{ _id: 'a', email: 'A@example.com', clerkId: 'user_old' }, { _id: 'b', email: 'b@example.com', clerkId: 'user_other' }];
  const mapping = [{ email: 'a@EXAMPLE.com', clerkId: 'user_new' }];
  it('matches case-insensitively and is idempotent', () => {
    expect(planClerkRelink(users, mapping)[0]).toMatchObject({ before: 'user_old', after: 'user_new', userId: 'a' });
    expect(planClerkRelink([{ ...users[0], clerkId: 'user_new' }], mapping)[0]).toMatchObject({ before: 'user_new', after: 'user_new' });
  });
  it('refuses unknown, ambiguous, conflicting and duplicate entries', () => {
    expect(() => planClerkRelink([], mapping)).toThrow();
    expect(() => planClerkRelink([...users, { ...users[0], _id: 'c' }], mapping)).toThrow();
    expect(() => planClerkRelink(users, [{ ...mapping[0], clerkId: 'user_other' }])).toThrow();
    expect(() => planClerkRelink(users, [...mapping, ...mapping])).toThrow();
  });
});
describe('Clerk mapping fixtures', () => {
  const user = (id: string, status = 'verified') => ({ id, primary_email_address_id: 'e', email_addresses: [{ id: 'e', email_address: 'A@example.com', verification: { status } }] });
  it('maps each verified production primary email, skipping unverified accounts', () => {
    expect(mappingFromUsers([user('new')])).toEqual([{ email: 'a@example.com', clerkId: 'new' }]);
    expect(mappingFromUsers([user('new', 'unverified')])).toEqual([]);
  });
  it('refuses two production accounts with the same email', () => {
    expect(() => mappingFromUsers([user('new'), user('duplicate')])).toThrow();
  });
  it('paginates until a short page', async () => {
    const urls: string[] = [];
    const users = await listClerkUsers('fixture', async url => { urls.push(String(url)); return new Response(JSON.stringify(urls.length === 1 ? Array.from({ length: 100 }, () => user('fixture')) : [])); });
    expect(users).toHaveLength(100); expect(urls[1]).toContain('offset=100');
  });
});

describe('relink mutation', () => {
  function fixture() {
    const records: Record<string, Array<Record<string, string>>> = {
      users: [{ _id: 'u', email: 'a@example.com', clerkId: 'user_old' }],
      organizations: [{ _id: 'o', createdBy: 'user_old' }, { _id: 'unrelated', createdBy: 'user_other' }],
    };
    let writes = 0;
    const ctx = { db: {
      query(table: string) {
        let rows = records[table];
        const chain = {
          withIndex(_name: string, configure: (q: { eq: (field: string, value: string) => void }) => void) {
            configure({ eq(field, value) { rows = rows.filter(row => row[field] === value); } });
            return chain;
          },
          async take(count: number) { return rows.slice(0, count); },
        };
        return chain;
      },
      async patch(id: string, patch: Record<string, string>) {
        writes++;
        Object.assign(Object.values(records).flat().find(row => row._id === id)!, patch);
      },
    } } as unknown as MutationCtx;
    const run = (mapping: Array<{email: string; clerkId: string}>, dryRun?: boolean) =>
      (relinkClerkIds as unknown as { _handler: (ctx: MutationCtx, args: {mapping: typeof mapping; dryRun?: boolean}) => Promise<unknown> })._handler(ctx, { mapping, dryRun });
    return { records, run, writes: () => writes };
  }
  const mapping = [{ email: 'a@example.com', clerkId: 'user_new' }];
  it('defaults to dry-run, updates both copies, then becomes a no-op', async () => {
    const f = fixture();
    await f.run(mapping); expect(f.writes()).toBe(0);
    await f.run(mapping, false);
    expect(f.records.users[0].clerkId).toBe('user_new');
    expect(f.records.organizations.map(row => row.createdBy)).toEqual(['user_new', 'user_other']);
    expect(f.writes()).toBe(2);
    await f.run(mapping, false); expect(f.writes()).toBe(2);
  });
  it('validates the whole batch before writing', async () => {
    const f = fixture();
    await expect(f.run([...mapping, {email: 'unknown@example.com', clerkId: 'user_unknown'}], false)).rejects.toThrow();
    expect(f.writes()).toBe(0);
  });
});
