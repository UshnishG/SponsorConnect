import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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

function AuthPage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
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
      const { error } = await supabase.auth.signInWithOtp({
        email: emailLower,
        options: { emailRedirectTo: window.location.origin },
      });
      
      if (error) throw error;
      
      setStep("code");
      toast.success("Login email sent!");
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    const cleanCode = code.replace(/\s/g, "");

    if (cleanCode.length !== 8) {
      toast.error("Please enter the 8-digit code");
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
    } catch (err: any) {
      toast.error(err?.message || "Invalid or expired code");
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
        const { error } = await supabase.auth.signUp({
          email: emailLower, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name || emailLower.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm, then sign in.");
        setPasswordMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: emailLower, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err?.message || "Authentication failed");
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
                      Click the Magic Link in the email, or type the 8-digit code below:
                    </p>
                    <input 
                      ref={codeInputRef}
                      type="text" required placeholder="00000000" 
                      value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} 
                      className="sc-input font-mono" 
                      style={{ padding: "0.85rem", fontSize: "2rem", textAlign: "center", letterSpacing: "0.2em", fontWeight: "bold" }}
                      maxLength={8}
                    />
                  </div>

                  <button type="submit" disabled={loading || code.length !== 8} className="btn-stamp w-full justify-center" style={{ fontSize: "1.1rem", padding: "0.85rem" }}>
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
