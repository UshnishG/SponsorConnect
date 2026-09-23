import { getRequest } from "@tanstack/react-start/server";

// Sends sign-in codes / magic links through the app's own Gmail SMTP instead of
// Supabase's built-in mailer. The built-in mailer only delivers to members of the
// Supabase project's team (and ~2 emails/hour), so OTP and magic-link sign-in
// silently fail for everyone else unless custom SMTP is set up in the dashboard.

export const ALLOWED_LOGIN_DOMAIN = "@srmist.edu.in";
const RESEND_COOLDOWN_MS = 60_000;

export type LoginEmailResult =
  | { via: "app"; email: string }
  // Service role key or Gmail credentials are missing on this deployment —
  // the browser should fall back to supabase.auth.signInWithOtp().
  | { via: "supabase"; email: string };

export function canSendLoginEmail(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.GMAIL_USER &&
      process.env.GMAIL_APP_PASSWORD,
  );
}

/**
 * Origin used in the emailed link. Prefer an explicitly configured URL; otherwise
 * the host this request actually arrived on (NOT a client-supplied value — the
 * link carries a login token, so it must never point at an arbitrary domain).
 */
function getAppOrigin(): string {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const request = getRequest();
  if (request?.url) return new URL(request.url).origin;
  return process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:8080";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function buildLoginEmailHtml(code: string, link: string): string {
  const safeLink = escapeHtml(link);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#fdf8ef;font-family:Arial,Helvetica,sans-serif;color:#0e0d0b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8ef;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:3px solid #0e0d0b">
<tr><td style="background:#0e0d0b;padding:20px 24px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#f5f0e8">SPONSOR<span style="color:#f39c12">CONNECT</span></td></tr>
<tr><td style="padding:28px 24px">
<p style="margin:0 0 16px;font-size:15px">Use this code to sign in to SponsorConnect:</p>
<p style="margin:0 0 24px;font-family:'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:8px;text-align:center;background:#e8e0cc;padding:14px 8px">${escapeHtml(code)}</p>
<p style="margin:0 0 16px;font-size:15px">Or sign in with one click:</p>
<p style="margin:0 0 24px;text-align:center"><a href="${safeLink}" style="display:inline-block;background:#0e0d0b;color:#f5f0e8;text-decoration:none;font-weight:bold;letter-spacing:2px;padding:12px 22px">SIGN IN &rarr;</a></p>
<p style="margin:0;font-size:12px;color:#6a6258">This code and link expire soon and can only be used once. If you didn't request this, you can ignore this email.</p>
</td></tr>
<tr><td style="border-top:3px solid #0e0d0b;padding:12px 24px;font-size:11px;color:#6a6258;letter-spacing:1px">IEEE COMPUTER SOCIETY &middot; SRMIST</td></tr>
</table></td></tr></table></body></html>`;
}

/** Throws if a code was already sent to this address less than a minute ago. */
async function assertNotRateLimited(
  supabaseAdmin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  email: string,
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!profile?.id) return;

  const { data } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  const user = data?.user;
  if (!user) return;

  const lastSent = Math.max(
    user.recovery_sent_at ? Date.parse(user.recovery_sent_at) : 0,
    user.confirmation_sent_at ? Date.parse(user.confirmation_sent_at) : 0,
  );
  const waitMs = lastSent + RESEND_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    throw new Error(`A code was just sent. Please wait ${Math.ceil(waitMs / 1000)}s before requesting another.`);
  }
}

export async function sendLoginEmail(rawEmail: string): Promise<LoginEmailResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.endsWith(ALLOWED_LOGIN_DOMAIN)) {
    throw new Error(`Only ${ALLOWED_LOGIN_DOMAIN} addresses are permitted`);
  }

  if (!canSendLoginEmail()) {
    console.warn(
      "[login-email] SUPABASE_SERVICE_ROLE_KEY / GMAIL_USER / GMAIL_APP_PASSWORD not set — " +
        "falling back to Supabase's built-in mailer (only delivers to project team members unless custom SMTP is configured).",
    );
    return { via: "supabase", email };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await assertNotRateLimited(supabaseAdmin, email);

  // Creates the user on first sign-in (GoTrue turns a magiclink for an unknown
  // email into a signup), and returns the OTP + token hash without sending mail.
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties) {
    console.error("[login-email] generateLink failed:", error);
    throw new Error("Could not start sign-in. Please try again in a moment.");
  }

  const { email_otp: code, hashed_token: tokenHash } = data.properties;
  const params = new URLSearchParams({ token_hash: tokenHash, type: "email" });
  const link = `${getAppOrigin()}/auth?${params.toString()}`;

  const sender = process.env.GMAIL_USER!;
  const { createMailer } = await import("./email-transport.server");
  const mailer = await createMailer();
  try {
    await mailer.send({
      from: `SponsorConnect <${sender}>`,
      to: email,
      subject: `Your SponsorConnect sign-in code: ${code}`,
      html: buildLoginEmailHtml(code, link),
      messageId: `<login-${crypto.randomUUID()}@${new URL(getAppOrigin()).host}>`,
    });
  } catch (e) {
    console.error("[login-email] SMTP send failed:", e instanceof Error ? e.message : e);
    throw new Error("Could not send the sign-in email. Please try again, or use password sign-in.");
  } finally {
    await mailer.close().catch(() => {});
  }

  return { via: "app", email };
}
