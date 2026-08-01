import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GMAIL_SCOPE = "openid email profile https://www.googleapis.com/auth/gmail.send";
const DEFAULT_APP_ORIGIN = "https://sponsor-spark-75.lovable.app";

function getRedirectUri(): string {
  const base = process.env.PUBLIC_APP_URL || process.env.APP_URL || DEFAULT_APP_ORIGIN;
  return `${base.replace(/\/$/, "")}/api/public/oauth/gmail-callback`;
}

/** Returns a Google OAuth URL to request the gmail.send scope for the current user. */
export const getGmailConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Gmail sending is not configured yet. Ask an admin to add Google OAuth credentials.",
      );
    }
    const redirectUri = getRedirectUri();
    // Signed state binds userId + nonce + expiry so the callback can't be
    // forged with another user's id.
    const { signGmailOAuthState } = await import("./gmail-oauth-state.server");
    const nonce = crypto.randomUUID();
    const state = signGmailOAuthState(context.userId, nonce);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("gmail_tokens").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export { GMAIL_SCOPE, getRedirectUri };
