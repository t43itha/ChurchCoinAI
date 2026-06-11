const INVITE_TOKEN_STORAGE_KEY = "churchcoin_invite_token";

export function storeInviteToken(token: string) {
  localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
}

export function getStoredInviteToken(): string | null {
  return localStorage.getItem(INVITE_TOKEN_STORAGE_KEY);
}

export function clearStoredInviteToken() {
  localStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
}

// Accepts a raw token or a full invite URL and returns the token, or null
export function extractInviteToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fromUrl = url.searchParams.get("invite");
    if (fromUrl) return fromUrl;
  } catch {
    // Not a URL — treat as a raw token
  }
  return /^[a-f0-9]{16,}$/i.test(trimmed) ? trimmed : null;
}
