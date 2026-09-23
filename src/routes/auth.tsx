import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useRef } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginEmail } from "@/lib/login.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — SponsorConnect" },
      { name: "description", content: "Sign in to SponsorConnect." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const ALLOWED_DOMAIN = "@srmist.edu.in";
// Supabase's "Email OTP length" setting can be 6–10 digits.
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 10;
const LINK_OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

function describeAuthError(err: unknown, fallback: string): string {
  const { message: msg = "", code = "" } = (err ?? {}) as { message?: string; code?: string | null };
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg))
    return "Wrong email or password. No account on this site yet? Choose Sign Up, or sign in with an email code instead.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return "This email isn't confirmed yet. Sign in with an email code instead — that confirms it automatically.";
  if (code === "user_already_exists" || /already registered/i.test(msg))
    return "An account with this email already exists. Switch to Sign In.";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg))
    return "Too many sign-in emails requested. Please wait a few minutes and try again.";
  if (code === "otp_expired" || /expired|invalid.*(otp|token)/i.test(msg))
    return "That code or link is invalid or has expired. Request a new one.";
  if (/not authorized/i.test(msg))
    return "The sign-in email couldn't be sent to this address. Use password sign-in, or ask an admin to finish email setup.";
  return msg || fallback;
}

function AuthPage() {
  const navigate = useNavigate();
  const requestLoginEmailFn = useServerFn(requestLoginEmail);
  const [loading, setLoading] = useState(false);
  
  // High-level auth method
  const [authMethod, setAuthMethod] = useState<"passwordless" | "password">("passwordless");
  
  // Password mode state
  const [passwordMode, setPasswordMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Passwordless state
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Shared state
  const [email, setEmail] = useState("");

  // Arriving from an emailed sign-in link: /auth?token_hash=…&type=email, or a
  // Supabase redirect carrying #error_description=… (e.g. an expired link).
  // Must run before the session effect below so a stripped error hash is never
  // parsed; #access_token redirects are left for supabase-js to pick up.
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const tokenHash = url.searchParams.get("token_hash");
    const linkType = url.searchParams.get("type") as EmailOtpType | null;
    const linkError = url.searchParams.get("error_description") || hash.get("error_description");
    if (!tokenHash && !linkError) return;

    // One-time values — drop them from the address bar and history.
    window.history.replaceState(null, "", url.pathname);

    if (linkError) {
      const code = url.searchParams.get("error_code") || hash.get("error_code");
      toast.error(describeAuthError({ message: linkError, code }, linkError));
      return;
    }

    setLoading(true);
    supabase.auth
      .verifyOtp({
        token_hash: tokenHash!,
        type: linkType && LINK_OTP_TYPES.includes(linkType) ? linkType : "email",
      })
      .then(({ error }) => {
        if (error) toast.error(describeAuthError(error, "Sign-in link is invalid or has expired"));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/composer" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/composer" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // --- PASSWORDLESS HANDLERS ---
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    
    if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
      toast.error(`Only ${ALLOWED_DOMAIN} addresses are permitted`); 
      return;
    }
    
    setLoading(true);
    try {
      // Sent through the app's own Gmail SMTP when the server is configured for it;
      // otherwise fall back to Supabase's built-in mailer.
      const res = await requestLoginEmailFn({ data: { email: emailLower } });
      if (res.via === "supabase") {
        const { error } = await supabase.auth.signInWithOtp({
          email: emailLower,
          // /auth (not /) is where the session in the redirect gets picked up.
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
      }

      setStep("code");
      toast.success("Login email sent! Check your inbox (and spam folder).");
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err) {
      toast.error(describeAuthError(err, "Failed to send code"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    const cleanCode = code.replace(/\s/g, "");

    if (cleanCode.length < MIN_CODE_LENGTH || cleanCode.length > MAX_CODE_LENGTH) {
      toast.error("Please enter the code from the email");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: emailLower,
        token: cleanCode,
        type: "email",
      });

      if (error) throw error;
    } catch (err) {
      toast.error(describeAuthError(err, "Invalid or expired code"));
    } finally {
      setLoading(false);
    }
  };

  // --- PASSWORD HANDLERS ---
  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    
    if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
      toast.error(`Only ${ALLOWED_DOMAIN} addresses are permitted`); return;
    }
    if (password.length < 6) { toast.error("Password must be ≥ 6 characters"); return; }
    
    setLoading(true);
    try {
      if (passwordMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: emailLower, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: name || emailLower.split("@")[0] },
          },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is off — already signed in; onAuthStateChange redirects.
          toast.success("Account created!");
        } else if (data.user && data.user.identities?.length === 0) {
          // Supabase hides "already registered" behind an empty identities list.
          toast.error("An account with this email already exists. Switch to Sign In.");
          setPasswordMode("signin");
        } else {
          toast.success("Check your email to confirm, then sign in.");
          setPasswordMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: emailLower, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(describeAuthError(err, "Authentication failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#fdf8ef" }}>
      {/* ── LEFT — branding ── */}
      <div
        className="hidden lg:flex flex-col justify-between"
        style={{
          width: "480px",
          flexShrink: 0,
          background: "#0e0d0b",
          backgroundImage: `
            repeating-linear-gradient(0deg,transparent,transparent 28px,rgba(255,255,255,0.015) 28px,rgba(255,255,255,0.015) 29px),
            repeating-linear-gradient(90deg,transparent,transparent 28px,rgba(255,255,255,0.01) 28px,rgba(255,255,255,0.01) 29px)
          `,
          borderRight: "3px solid #0e0d0b",
          padding: "3rem 2.5rem",
        }}
      >
        <div>
          <div style={{ borderBottom: "3px solid #2a2520", paddingBottom: "1.5rem", marginBottom: "2rem" }}>
            <div className="font-brutalist text-5xl leading-none tracking-widest" style={{ color: "#f5f0e8" }}>
              SPONSOR
            </div>
            <div className="font-brutalist text-5xl leading-none tracking-widest" style={{ color: "#f39c12" }}>
              CONNECT
            </div>
            <div className="font-mono text-[11px] mt-2" style={{ color: "#4a4540", letterSpacing: "0.12em" }}>
              IEEE COMPUTER SOCIETY · SRMIST
            </div>
          </div>

          <h1 className="font-display text-4xl leading-snug mb-4" style={{ color: "#f5f0e8" }}>
            Outreach,<br />
            <em style={{ color: "#f39c12" }}>beautifully</em><br />
            delivered.
          </h1>
          <p className="font-mono text-sm leading-relaxed" style={{ color: "#6a6258" }}>
            Compose, send and track branded sponsorship<br />
            and ambassador emails for AICSSYC 2026.
          </p>
        </div>

        <div style={{ borderTop: "3px solid #2a2520", paddingTop: "1.5rem" }}>
          <div className="font-mono text-[10px] mb-3" style={{ color: "#4a4540", letterSpacing: "0.15em" }}>
            ── FEATURES ──
          </div>
          {[
            "Live email preview as you compose",
            "Personalised merge fields per recipient",
            "Real-time delivery & bounce tracking",
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "flex-start" }}>
              <span className="font-brutalist text-sm" style={{ color: "#c0392b", flexShrink: 0, marginTop: "1px" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-xs" style={{ color: "#8a8070", lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT — form ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>
        <div style={{ width: "100%", maxWidth: "380px" }}>
          
          <div className="lg:hidden mb-8">
            <div className="font-brutalist text-4xl leading-none tracking-widest" style={{ color: "#0e0d0b" }}>SPONSOR</div>
            <div className="font-brutalist text-4xl leading-none tracking-widest" style={{ color: "#f39c12" }}>CONNECT</div>
          </div>

          {/* MAIN AUTH TABS */}
          <div style={{ display: "flex", border: "2.5px solid #0e0d0b", marginBottom: "2rem" }}>
            <button
              type="button"
              onClick={() => { setAuthMethod("passwordless"); setStep("email"); }}
              className="font-brutalist"
              style={{
                flex: 1, padding: "0.6rem", fontSize: "1rem", letterSpacing: "0.08em",
                border: "none", cursor: "pointer", transition: "all 0.1s",
                background: authMethod === "passwordless" ? "#0e0d0b" : "#fdf8ef",
                color: authMethod === "passwordless" ? "#f5f0e8" : "#6b6050",
                borderRight: "2.5px solid #0e0d0b",
              }}
            >
              MAGIC LINK / OTP
            </button>
            <button
              type="button"
              onClick={() => { setAuthMethod("password"); setStep("email"); }}
              className="font-brutalist"
              style={{
                flex: 1, padding: "0.6rem", fontSize: "1rem", letterSpacing: "0.08em",
                border: "none", cursor: "pointer", transition: "all 0.1s",
                background: authMethod === "password" ? "#0e0d0b" : "#fdf8ef",
                color: authMethod === "password" ? "#f5f0e8" : "#6b6050",
              }}
            >
              PASSWORD
            </button>
          </div>

          {authMethod === "passwordless" && (
            <>
              {step === "code" ? (
                <form onSubmit={handleVerifyCode} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div className="sc-card-heavy" style={{ padding: "1.5rem", background: "#e8e0cc" }}>
                    <label className="sc-label" style={{ textAlign: "center", border: "none", padding: 0, marginBottom: "0.75rem" }}>
                      CHECK YOUR INBOX
                    </label>
                    <p className="font-mono text-xs text-center mb-4" style={{ color: "#6a6258" }}>
                      Click the sign-in link in the email sent to <strong>{email.trim().toLowerCase()}</strong>, or type the code below:
                    </p>
                    <input
                      ref={codeInputRef}
                      type="text" inputMode="numeric" autoComplete="one-time-code" required placeholder="Code"
                      value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, MAX_CODE_LENGTH))}
                      className="sc-input font-mono"
                      style={{ padding: "0.85rem", fontSize: "2rem", textAlign: "center", letterSpacing: "0.2em", fontWeight: "bold" }}
                      maxLength={MAX_CODE_LENGTH}
                    />
                  </div>

                  <button type="submit" disabled={loading || code.length < MIN_CODE_LENGTH} className="btn-stamp w-full justify-center" style={{ fontSize: "1.1rem", padding: "0.85rem" }}>
                    {loading ? "VERIFYING…" : "VERIFY CODE →"}
                  </button>
                  <button type="button" disabled={loading} onClick={() => { setStep("email"); setCode(""); }} className="btn-stamp-ghost" style={{ fontSize: "0.85rem", width: "100%", justifyContent: "center" }}>
                    ← BACK
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSendCode} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div>
                    <label className="sc-label">SRMIST Email</label>
                    <input 
                      type="email" required placeholder={`your.id${ALLOWED_DOMAIN}`} 
                      value={email} onChange={e => setEmail(e.target.value)} 
                      className="sc-input" style={{ padding: "0.85rem", fontSize: "1rem" }}
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-stamp w-full justify-center" style={{ fontSize: "1.1rem", padding: "0.85rem" }}>
                    {loading ? "SENDING…" : "GET LOGIN LINK / CODE →"}
                  </button>
                </form>
              )}
            </>
          )}

          {authMethod === "password" && (
            <form onSubmit={handlePasswordAuth} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="radio" checked={passwordMode === "signin"} onChange={() => setPasswordMode("signin")} />
                  <span className="font-brutalist text-lg" style={{ color: passwordMode === "signin" ? "#0e0d0b" : "#9a9080" }}>Sign In</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="radio" checked={passwordMode === "signup"} onChange={() => setPasswordMode("signup")} />
                  <span className="font-brutalist text-lg" style={{ color: passwordMode === "signup" ? "#0e0d0b" : "#9a9080" }}>Sign Up</span>
                </label>
              </div>

              {passwordMode === "signup" && (
                <div>
                  <label className="sc-label">Full Name</label>
                  <input type="text" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} className="sc-input" />
                </div>
              )}

              <div>
                <label className="sc-label">Email</label>
                <input type="email" required placeholder={`your.id${ALLOWED_DOMAIN}`} value={email} onChange={e => setEmail(e.target.value)} className="sc-input" />
              </div>

              <div>
                <label className="sc-label">Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required placeholder="Min. 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="sc-input" style={{ paddingRight: "2.5rem" }}
                  />
                  <button
                    type="button" onClick={() => setShowPassword(v => !v)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#9a9080", background: "none", border: "none", cursor: "pointer" }}
                  >
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-stamp w-full justify-center mt-2" style={{ fontSize: "1.1rem", padding: "0.85rem" }}>
                {loading ? "PLEASE WAIT…" : passwordMode === "signin" ? "SIGN IN →" : "CREATE ACCOUNT →"}
              </button>
            </form>
          )}

          <p className="font-mono text-[11px] mt-8 text-center" style={{ color: "#9a9080" }}>
            Only <strong style={{ color: "#6b6050" }}>{ALLOWED_DOMAIN}</strong> accounts permitted
          </p>
        </div>
      </div>
    </div>
  );
}
