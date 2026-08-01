import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — SponsorConnect" },
      { name: "description", content: "Sign in to access the IEEE Computer Society SponsorConnect platform." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const ALLOWED_DOMAIN = "@srmist.edu.in";

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const signInGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth",
      },
    });
    if (error) {
      toast.error(error.message || "Sign-in failed");
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.endsWith(ALLOWED_DOMAIN)) {
      toast.error(`Only ${ALLOWED_DOMAIN} email addresses are allowed`);
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailLower,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: { full_name: name || emailLower.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
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
    <div className="min-h-screen flex" style={{ background: "oklch(0.1 0.025 255)" }}>
      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 relative overflow-hidden p-12"
        style={{
          background: "linear-gradient(145deg, oklch(0.14 0.04 275), oklch(0.11 0.025 255))",
          borderRight: "1px solid oklch(0.22 0.04 255)",
        }}>
        {/* Radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: "oklch(0.62 0.24 280 / 10%)", filter: "blur(60px)" }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.62 0.24 280), oklch(0.65 0.22 260))" }}>
              <span className="text-white font-extrabold text-base">SC</span>
            </div>
            <div>
              <div className="font-bold text-base" style={{ color: "oklch(0.92 0.005 255)" }}>SponsorConnect</div>
              <div className="text-xs" style={{ color: "oklch(0.45 0.02 255)" }}>IEEE Computer Society SRMIST</div>
            </div>
          </div>

          <h1 className="text-4xl font-extrabold leading-tight mb-4">
            <span className="gradient-text">Outreach,</span>
            <br />
            <span style={{ color: "oklch(0.88 0.005 255)" }}>beautifully</span>
            <br />
            <span style={{ color: "oklch(0.88 0.005 255)" }}>delivered.</span>
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "oklch(0.55 0.02 255)" }}>
            Compose, send, and track branded sponsorship and ambassador outreach emails for AICSSYC 2026.
          </p>
        </div>

        {/* Feature list */}
        <div className="relative z-10 space-y-3">
          {[
            { icon: "✦", text: "Live email preview as you compose" },
            { icon: "✦", text: "Personalised merge fields per recipient" },
            { icon: "✦", text: "Real-time delivery & bounce tracking" },
          ].map((f) => (
            <div key={f.text} className="flex items-start gap-3">
              <span className="text-xs mt-0.5" style={{ color: "oklch(0.68 0.22 275)" }}>{f.icon}</span>
              <span className="text-sm" style={{ color: "oklch(0.6 0.02 255)" }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right sign-in panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-10 justify-center">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.62 0.24 280), oklch(0.65 0.22 260))" }}>
              <span className="text-white font-extrabold text-sm">SC</span>
            </div>
            <span className="font-bold" style={{ color: "oklch(0.92 0.005 255)" }}>SponsorConnect</span>
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: "oklch(0.92 0.005 255)" }}>
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-sm mb-7" style={{ color: "oklch(0.5 0.02 255)" }}>
            {mode === "signin" ? "Sign in to your account to continue." : "Join with your SRMIST email."}
          </p>

          {/* Mode tabs */}
          <div className="flex p-1 rounded-xl mb-6" style={{ background: "oklch(0.16 0.03 255)" }}>
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                style={mode === m
                  ? { background: "oklch(0.62 0.24 280)", color: "white", boxShadow: "0 2px 8px oklch(0.62 0.24 280 / 40%)" }
                  : { color: "oklch(0.5 0.02 255)" }
                }
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="sc-label">Full name</label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="sc-input"
                />
              </div>
            )}
            <div>
              <label className="sc-label">Email</label>
              <input
                type="email"
                required
                placeholder={`your.id${ALLOWED_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sc-input"
              />
            </div>
            <div>
              <label className="sc-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="sc-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "oklch(0.45 0.02 255)" }}
                >
                  {showPassword
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full text-sm mt-2">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "oklch(0.22 0.04 255)" }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: "oklch(0.4 0.02 255)" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "oklch(0.22 0.04 255)" }} />
          </div>

          {/* Google */}
          <button
            onClick={signInGoogle}
            disabled={loading}
            className="btn-ghost w-full flex items-center justify-center gap-3 text-sm"
          >
            <svg width="17" height="17" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-xs" style={{ color: "oklch(0.4 0.02 255)" }}>
            Only <span className="font-semibold" style={{ color: "oklch(0.6 0.02 255)" }}>{ALLOWED_DOMAIN}</span> accounts are allowed.
          </p>
        </div>
      </div>
    </div>
  );
}
