/* global process, console */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const productionUrl = 'https://valuable-akita-907.convex.cloud';
export function buildDecision(env) {
  if (env.VERCEL_ENV !== 'production') return { command: 'npm run build' };
  const key = env.CONVEX_DEPLOY_KEY?.trim();
  const problems = [];
  if (!env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_')) problems.push('VITE_CLERK_PUBLISHABLE_KEY must be a production key');
  if (!key || !/^prod:valuable-akita-907\|\S+$/.test(key)) problems.push('CONVEX_DEPLOY_KEY must target the production deployment');
  if (env.VITE_CONVEX_URL?.trim() && env.VITE_CONVEX_URL.trim() !== productionUrl) problems.push('VITE_CONVEX_URL must target the production deployment');
  if (env.REQUIRE_PRODUCTION_KEYS === '1' && problems.length) return { refusal: problems.join('; ') };
  return {
    command: key ? 'npx convex deploy --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL' : 'npm run build',
    warning: problems.length ? 'WARNING: PRODUCTION BUILD IS USING DEVELOPMENT OR UNVERIFIED CONFIGURATION. ' + problems.join('; ') : undefined,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const decision = buildDecision(process.env);
  if (decision.refusal) { console.error(decision.refusal); process.exitCode = 1; }
  else {
    if (decision.warning) console.warn(decision.warning);
    console.log(`Build command: ${decision.command}`);
    const result = spawnSync(decision.command, { shell: true, stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  }
}
