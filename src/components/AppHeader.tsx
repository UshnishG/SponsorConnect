import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import logo from "@/assets/ieee-cs-80.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { type MeResponse } from "@/lib/auth.functions";

const ROLE_BADGES: Record<string, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  volunteer: { label: "Volunteer", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export function AppHeader({ me }: { me: MeResponse | null; onRefresh?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const badge = me ? ROLE_BADGES[me.role] : null;

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo.url} alt="IEEE CS 80" className="w-9 h-9 object-contain" />
            <div>
              <div className="text-sm font-bold text-slate-900 leading-tight">IEEE Computer Society Outreach</div>
              <div className="text-[10px] text-slate-500 leading-tight">IEEE Computer Society SRMIST</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link to="/" className="px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-100" activeProps={{ className: "px-3 py-1.5 rounded-md bg-amber-50 text-amber-800 font-semibold" }}>Composer</Link>
            <Link to="/dashboard" className="px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-100" activeProps={{ className: "px-3 py-1.5 rounded-md bg-amber-50 text-amber-800 font-semibold" }}>Dashboard</Link>
            
            {me?.role === "admin" && (
              <Link to="/admin" className="px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-100" activeProps={{ className: "px-3 py-1.5 rounded-md bg-amber-50 text-amber-800 font-semibold" }}>Admin</Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {me && (
            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1">
                Shared sender ready
              </span>
              {me.daily_limit !== null && (
                <span className="text-slate-500">
                  {me.today_sent}/{me.daily_limit} today
                </span>
              )}
            </div>
          )}
          {me && (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-slate-200 pl-1 pr-3 py-1 hover:bg-slate-50"
              >
                {me.avatar_url ? (
                  <img src={me.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-xs font-semibold text-white">
                    {(me.name || me.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-slate-800 max-w-[140px] truncate">{me.name || me.email}</span>
                {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>}
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-64 rounded-lg border bg-white shadow-lg z-50">
                  <div className="p-3 border-b">
                    <div className="text-sm font-semibold text-slate-900 truncate">{me.name}</div>
                    <div className="text-xs text-slate-500 truncate">{me.email}</div>
                    {badge && <span className={`mt-2 inline-block text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>}
                  </div>
                  <div className="p-2 text-sm">
                    <button onClick={signOut} className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-rose-700">
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
