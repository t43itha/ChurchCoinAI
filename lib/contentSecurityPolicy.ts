export function clerkFrontendHost(key: string | undefined): string | null {
  const encoded = key?.match(/^pk_(?:test|live)_([A-Za-z0-9+/]+={0,2})$/)?.[1];
  if (!encoded) return null;
  try {
    const decoded = atob(encoded);
    const host = decoded.endsWith('$') ? decoded.slice(0, -1) : '';
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host) ? host.toLowerCase() : null;
  } catch { return null; }
}

export function contentSecurityPolicy(key?: string): string {
  const host = clerkFrontendHost(key);
  const clerk = host ? `https://${host}` : 'https://*.clerk.accounts.dev';
  return `default-src 'self'; script-src 'self' ${clerk} https://challenges.cloudflare.com https://*.protect.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' ${clerk} https://img.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.protect.clerk.com:* https://*.convex.cloud wss://*.convex.cloud https://*.ingest.sentry.io; frame-src 'self' ${clerk} https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self';`;
}
