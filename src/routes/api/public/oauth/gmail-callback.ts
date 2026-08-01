import { createFileRoute } from "@tanstack/react-router";

function htmlResponse(title: string, message: string, ok: boolean) {
  const color = ok ? "#059669" : "#dc2626";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.08)}
    h1{color:${color};margin:0 0 12px}p{color:#475569}a{color:#d97706;font-weight:600;text-decoration:none}</style></head>
    <body><div class="card"><h1>${title}</h1><p>${message}</p><p><a href="/">Return to app →</a></p></div>
    <script>setTimeout(()=>{try{window.close()}catch(e){}window.location.href='/'},1800)</script>
    </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/gmail-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) return htmlResponse("Gmail connect failed", `Google returned: ${error}`, false);
        if (!code || !state) return htmlResponse("Gmail connect failed", "Missing code or state.", false);

        const { verifyGmailOAuthState } = await import("@/lib/gmail-oauth-state.server");
        const verified = verifyGmailOAuthState(state);
        if (!verified) {
          return htmlResponse("Gmail connect failed", "Invalid or expired state.", false);
        }
        const userId = verified.userId;

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return htmlResponse("Not configured", "Google OAuth credentials are not set.", false);
        }

        const redirectUri = `${url.origin}/api/public/oauth/gmail-callback`;

        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        const tokens = (await tokenRes.json()) as {
          access_token?: string;
          refresh_token?: string;
          scope?: string;
          id_token?: string;
          error?: string;
          error_description?: string;
        };
        if (!tokenRes.ok || !tokens.access_token) {
          return htmlResponse(
            "Gmail connect failed",
            tokens.error_description || tokens.error || "Token exchange failed",
            false,
          );
        }
        if (!tokens.refresh_token) {
          return htmlResponse(
            "Gmail connect failed",
            "Google didn't return a refresh token. Try again — you may need to revoke previous access at myaccount.google.com/permissions.",
            false,
          );
        }

        // Fetch user email
        const profRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const prof = (await profRes.json()) as { email?: string };
        if (!prof.email) return htmlResponse("Gmail connect failed", "Couldn't read Gmail address.", false);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: upErr } = await supabaseAdmin.from("gmail_tokens").upsert({
          user_id: userId,
          refresh_token: tokens.refresh_token,
          gmail_email: prof.email,
          scope: tokens.scope ?? "",
        });
        if (upErr) return htmlResponse("Gmail connect failed", upErr.message, false);

        return htmlResponse("Gmail connected ✓", `Sending as ${prof.email}. Redirecting…`, true);
      },
    },
  },
});
