import { useState, type ReactNode } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { type MeResponse } from "@/lib/auth.functions";

type NavItem = { to: string; exact?: boolean; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  {
    to: "/",
    exact: true,
    label: "Composer",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      </svg>
    ),
  },
  {
    to: "/dashboard",
    exact: false,
    label: "Dashboard",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
        <rect width="7" height="9" x="3" y="3"/><rect width="7" height="5" x="14" y="3"/>
        <rect width="7" height="9" x="14" y="12"/><rect width="7" height="5" x="3" y="16"/>
      </svg>
    ),
  },
];

const ADMIN_NAV: NavItem = {
  to: "/admin",
  exact: false,
  label: "Admin",
  icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
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
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 sidebar-bg"
        style={{ borderBottom: "3px solid #0e0d0b" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="font-brutalist text-xl tracking-widest"
            style={{ color: "#f5f0e8", lineHeight: 1 }}
          >
            SC
          </div>
          <div style={{ width: "2px", height: "20px", background: "#f39c12" }} />
          <span className="font-brutalist text-sm tracking-widest" style={{ color: "#a09888" }}>
            SPONORCONNECT
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(v => !v)}
          style={{ color: "#a09888", border: "2px solid #2a2520", padding: "4px 6px", background: "#1a1814" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
            {mobileOpen
              ? <><path d="m18 6-12 12"/><path d="m6 6 12 12"/></>
              : <><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></>}
          </svg>
        </button>
      </div>

      {/* ── Fixed Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 h-full z-30 flex flex-col sidebar-bg transition-transform duration-300
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ width: "220px", borderRight: "3px solid #0e0d0b" }}
      >
        {/* Wordmark */}
        <div style={{ padding: "1.5rem 1rem 1rem", borderBottom: "2px solid #2a2520" }}>
          <div className="font-brutalist text-3xl leading-none tracking-widest" style={{ color: "#f5f0e8" }}>
            SPONSOR
          </div>
          <div className="font-brutalist text-3xl leading-none tracking-widest" style={{ color: "#f39c12" }}>
            CONNECT
          </div>
          <div className="font-mono text-[10px] mt-1.5" style={{ color: "#5a5248", letterSpacing: "0.1em" }}>
            IEEE CS SRMIST
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div className="font-mono text-[9px] mb-2 px-2" style={{ color: "#4a4540", letterSpacing: "0.15em" }}>
            ── NAVIGATION ──
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

          {/* Usage block */}
          {me && (
            <div style={{ marginTop: "auto", paddingTop: "1.5rem" }}>
              <div className="font-mono text-[9px] mb-2 px-2" style={{ color: "#4a4540", letterSpacing: "0.15em" }}>
                ── QUOTA ──
              </div>
              <div style={{
                border: "2px solid #2a2520",
                padding: "0.75rem",
                background: "#1a1814"
              }}>
                {me.daily_limit !== null ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span className="font-mono text-[11px]" style={{ color: "#a09888" }}>Today</span>
                      <span className="font-brutalist text-sm" style={{ color: "#f39c12" }}>
                        {me.today_sent}/{me.daily_limit}
                      </span>
                    </div>
                    {/* Hard bar */}
                    <div style={{ height: "6px", background: "#2a2520", border: "1.5px solid #3a3530" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(100, (me.today_sent / me.daily_limit) * 100)}%`,
                        background: me.today_sent >= me.daily_limit ? "#c0392b" : "#f39c12",
                        transition: "width 0.3s ease"
                      }} />
                    </div>
                  </>
                ) : (
                  <div className="font-mono text-[11px]" style={{ color: "#27ae60" }}>
                    ▶ Sender ready
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* User */}
        {me && (
          <div style={{ padding: "0.75rem", borderTop: "3px solid #2a2520", position: "relative" }}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.5rem",
                border: "2px solid #2a2520",
                background: userMenuOpen ? "#1a1814" : "transparent",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
              onBlur={() => setTimeout(() => setUserMenuOpen(false), 150)}
            >
              {me.avatar_url ? (
                <img src={me.avatar_url} alt="" style={{ width: 30, height: 30, objectFit: "cover", border: "2px solid #3a3530" }} />
              ) : (
                <div style={{
                  width: 30, height: 30,
                  background: "#c0392b",
                  border: "2px solid #0e0d0b",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "0.9rem",
                  color: "#f5f0e8",
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}>
                  {initials}
                </div>
              )}
              <div style={{ flex: 1, textAlign: "left", overflow: "hidden" }}>
                <div className="font-mono text-[11px] truncate" style={{ color: "#f5f0e8" }}>
                  {me.name || me.email}
                </div>
                <div className="font-mono text-[10px] truncate" style={{ color: "#5a5248" }}>
                  {me.email}
                </div>
              </div>
              <span className={me.role === "admin" ? "badge-admin" : "badge-volunteer"}>
                {me.role === "admin" ? "ADM" : "VOL"}
              </span>
            </button>

            {userMenuOpen && (
              <div
                className="stamp-in"
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "0.75rem",
                  right: "0.75rem",
                  marginBottom: "0.5rem",
                  background: "#f5f0e8",
                  border: "3px solid #0e0d0b",
                  boxShadow: "5px 5px 0 #0e0d0b",
                  zIndex: 50,
                }}
              >
                <div style={{ padding: "0.75rem", borderBottom: "2px solid #0e0d0b" }}>
                  <div className="font-brutalist text-sm tracking-wide" style={{ color: "#0e0d0b" }}>{me.name || "—"}</div>
                  <div className="font-mono text-[10px]" style={{ color: "#6b6050" }}>{me.email}</div>
                </div>
                <div style={{ padding: "0.5rem" }}>
                  <button
                    onClick={signOut}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "0.4rem 0.5rem",
                      fontFamily: "'Bebas Neue', sans-serif",
                      letterSpacing: "0.08em",
                      fontSize: "0.85rem",
                      color: "#c0392b",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f5ddd8")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    ← Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-20"
          style={{ background: "rgba(14, 13, 11, 0.6)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
