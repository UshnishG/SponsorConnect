import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { type MeResponse } from "@/lib/auth.functions";

const NAV = [
  {
    to: "/",
    exact: true,
    label: "Composer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      </svg>
    ),
  },
  {
    to: "/dashboard",
    exact: false,
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/>
        <rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
      </svg>
    ),
  },
];

const ADMIN_NAV = {
  to: "/admin",
  label: "Admin",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
};

export function AppHeader({ me }: { me: MeResponse | null; onRefresh?: () => void }) {
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const isAdmin = me?.role === "admin";
  const allNav = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  const initials = me ? (me.name || me.email).charAt(0).toUpperCase() : "?";

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3"
        style={{ background: "oklch(0.11 0.025 255)", borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.62 0.24 280), oklch(0.65 0.22 260))" }}>
            <span className="text-white font-bold text-xs">SC</span>
          </div>
          <span className="font-bold text-sm" style={{ color: "oklch(0.92 0.005 255)" }}>SponsorConnect</span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-1.5 rounded-md"
          style={{ color: "oklch(0.65 0.02 255)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen
              ? <><path d="m18 6-12 12"/><path d="m6 6 12 12"/></>
              : <><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></>}
          </svg>
        </button>
      </div>

      {/* ── Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 h-full z-30 flex flex-col transition-transform duration-300
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{
          width: "220px",
          background: "oklch(0.11 0.025 255)",
          borderRight: "1px solid oklch(0.22 0.04 255)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.62 0.24 280), oklch(0.65 0.22 260))" }}>
            <span className="text-white font-extrabold text-sm">SC</span>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight" style={{ color: "oklch(0.92 0.005 255)" }}>
              SponsorConnect
            </div>
            <div className="text-[10px] leading-tight" style={{ color: "oklch(0.45 0.02 255)" }}>
              IEEE CS SRMIST
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="mb-3">
            <div className="px-2 mb-1.5" style={{ color: "oklch(0.38 0.02 255)", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Navigation
            </div>
            {allNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="nav-link"
                activeProps={{ className: "nav-link active" }}
                activeOptions={item.exact ? { exact: true } : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>

          {/* Send limits */}
          {me && (
            <div className="mt-4 mx-1 p-3 rounded-xl" style={{ background: "oklch(0.16 0.03 255)", border: "1px solid oklch(0.25 0.04 255 / 50%)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "oklch(0.45 0.02 255)" }}>
                Today's usage
              </div>
              {me.daily_limit !== null ? (
                <>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs" style={{ color: "oklch(0.7 0.02 255)" }}>
                      {me.today_sent} / {me.daily_limit} emails
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "oklch(0.68 0.22 275)" }}>
                      {Math.round((me.today_sent / me.daily_limit) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.2 0.04 255)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (me.today_sent / me.daily_limit) * 100)}%`,
                        background: "linear-gradient(90deg, oklch(0.62 0.24 280), oklch(0.72 0.2 260))"
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-xs" style={{ color: "oklch(0.65 0.14 160)" }}>✓ Shared sender ready</div>
              )}
            </div>
          )}
        </nav>

        {/* User section */}
        {me && (
          <div className="px-3 pb-4 pt-2" style={{ borderTop: "1px solid oklch(0.22 0.04 255)" }}>
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors"
                style={{ background: userMenuOpen ? "oklch(0.18 0.035 255)" : "transparent" }}
                onBlur={() => setTimeout(() => setUserMenuOpen(false), 150)}
              >
                {me.avatar_url ? (
                  <img src={me.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
                    style={{ background: "linear-gradient(135deg, oklch(0.62 0.24 280), oklch(0.65 0.22 260))" }}>
                    {initials}
                  </div>
                )}
                <div className="flex-1 text-left overflow-hidden">
                  <div className="text-xs font-semibold truncate" style={{ color: "oklch(0.88 0.005 255)" }}>
                    {me.name || me.email}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "oklch(0.5 0.02 255)" }}>
                    {me.email}
                  </div>
                </div>
                <span className={me.role === "admin" ? "badge-admin" : "badge-volunteer"}>
                  {me.role === "admin" ? "Admin" : "Vol"}
                </span>
              </button>

              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden shadow-2xl z-50"
                  style={{ background: "oklch(0.16 0.03 255)", border: "1px solid oklch(0.28 0.05 255 / 60%)" }}>
                  <div className="px-3 py-2.5" style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
                    <div className="text-xs font-semibold" style={{ color: "oklch(0.88 0.005 255)" }}>{me.name || "—"}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "oklch(0.5 0.02 255)" }}>{me.email}</div>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={signOut}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{ color: "oklch(0.7 0.18 25)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.35 0.1 25 / 20%)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}
    </>
  );
}
