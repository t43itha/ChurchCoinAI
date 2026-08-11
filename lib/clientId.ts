/**
 * Generate an opaque client attempt ID in both secure and non-secure browser
 * contexts. randomUUID is unavailable on plain-HTTP LAN development URLs,
 * while getRandomValues remains broadly supported.
 */
export function createClientAttemptId(): string {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  if (typeof browserCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // The ID is an idempotency correlation value, not a credential. This final
  // fallback keeps old/non-secure test browsers functional.
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
