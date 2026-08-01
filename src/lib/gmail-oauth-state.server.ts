import { createHmac, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function signingKey(): string {
  const k =
    process.env.GMAIL_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!k) throw new Error("Missing signing secret for Gmail OAuth state");
  return k;
}

function hmac(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Build a signed state parameter binding a userId + nonce + expiry. */
export function signGmailOAuthState(userId: string, nonce: string): string {
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = `${userId}.${nonce}.${expiresAt}`;
  return `${payload}.${hmac(payload)}`;
}

/** Verify a state parameter came from our server, hasn't expired, and return the userId. */
export function verifyGmailOAuthState(state: string): { userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, nonce, expiresStr, sig] = parts;
  if (!userId || !nonce || !expiresStr || !sig) return null;

  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const payload = `${userId}.${nonce}.${expiresStr}`;
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId };
}
