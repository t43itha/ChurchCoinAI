import { describe, expect, it } from 'vitest';
import { buildDecision, productionUrl } from '../scripts/vercel-build.mjs';
import { clerkFrontendHost, contentSecurityPolicy } from '../lib/contentSecurityPolicy';
import { launchProblems, planClerkRelink } from '../convex/lib/productionLaunch';
import { listClerkUsers, mappingFromUsers } from '../scripts/clerk-relink-mapping.mjs';

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
  const env = { CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.churchcoin.co.uk', APP_BASE_URL: 'https://www.churchcoin.co.uk', GEMINI_API_KEY: 'secret', RESEND_API_KEY: 'secret', RESEND_FROM_EMAIL: 'ChurchCoin <hello@churchcoin.co.uk>' };
  it('needs no billing or bank secrets', () => expect(launchProblems(env)).toEqual([]));
  it('selects provider keys and reports names only', () => {
    expect(launchProblems({ ...env, CATEGORIZATION_AI_PROVIDER: 'openai' })).toEqual(['OPENAI_API_KEY']);
    expect(launchProblems({ ...env, CATEGORIZATION_AI_PROVIDER: 'openrouter' })).toEqual(['OPENROUTER_API_KEY']);
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
  it('uses verified primary emails in both instances', () => {
    expect(mappingFromUsers([user('old')], [user('new')])).toEqual([{ email: 'a@example.com', clerkId: 'new' }]);
    expect(mappingFromUsers([user('old', 'unverified')], [user('new')])).toEqual([]);
    expect(() => mappingFromUsers([user('old')], [user('new', 'unverified')])).toThrow();
    expect(() => mappingFromUsers([user('old')], [user('new'), user('duplicate')])).toThrow();
  });
  it('paginates until a short page', async () => {
    const urls: string[] = [];
    const users = await listClerkUsers('fixture', async url => { urls.push(String(url)); return new Response(JSON.stringify(urls.length === 1 ? Array.from({ length: 100 }, () => user('fixture')) : [])); });
    expect(users).toHaveLength(100); expect(urls[1]).toContain('offset=100');
  });
});
