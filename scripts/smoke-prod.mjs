/* global process, console, fetch, AbortSignal, URL */
import { productionUrl } from './vercel-build.mjs';

const args = process.argv.slice(2);
const origin = args[0];
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const expected = value('--expect-convex') || productionUrl;
const failures = [];
const request = url => fetch(url, { signal: AbortSignal.timeout(30000) });
try {
  if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Usage: node scripts/smoke-prod.mjs <origin> [--expect-convex URL] [--expect-live-clerk]');
  let html = '';
  for (const path of ['/', '/privacy', '/terms']) {
    const response = await request(new URL(path, origin));
    if (response.status !== 200) failures.push(`${path}: HTTP ${response.status}`);
    for (const header of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy']) {
      if (!response.headers.get(header)) failures.push(`${path}: missing ${header}`);
    }
    if (!response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")) failures.push(`${path}: missing frame-ancestors 'none' response directive`);
    if (path === '/') html = await response.text();
  }
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => new URL(match[1], origin));
  let bundle = '';
  for (const asset of assets) {
    const response = await request(asset);
    if (!response.ok) failures.push(`Bundle: HTTP ${response.status}`);
    bundle += await response.text();
  }
  if (!bundle.includes(expected)) failures.push(`Bundle does not reference expected Convex URL: ${expected}`);
  const keys = bundle.match(/pk_(?:test|live)_[A-Za-z0-9+/=]+/g) || [];
  if (!keys.some(key => key.startsWith('pk_live_')) || keys.some(key => key.startsWith('pk_test_'))) failures.push('Bundle does not use exclusively pk_live Clerk wiring');
  const response = await request(new URL('/version', expected));
  if (!response.ok) failures.push(`Expected Convex deployment: HTTP ${response.status}`);
  const query = 'queries/launchFeatures:get';
  if (query) {
    const response = await fetch(new URL('/api/query', expected), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: query, args: {}, format: 'json' }), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') failures.push('Launch features query unavailable: deploy PR-A (queries/launchFeatures:get) before cutover');
    else if (result.value?.billing !== false || result.value?.bankFeeds !== false) failures.push('Launch features query did not confirm billing and bank feeds are off');
  }
} catch (error) { failures.push(error instanceof Error ? error.message : 'Smoke request failed'); }
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(failures.length ? `Smoke failed: ${failures.length} failure(s)` : 'Smoke passed');
process.exitCode = failures.length ? 1 : 0;
