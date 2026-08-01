import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { getMe } from "@/lib/auth.functions";
import { listUsers, setUserRole, setUserActive, type AdminUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin — SponsorConnect" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const ROLE_OPTIONS: Array<AdminUser["role"]> = ["admin", "volunteer"];

function AdminPage() {
  const qc = useQueryClient();
  const meFn = useServerFn(getMe);
  const listFn = useServerFn(listUsers);
  const setRoleFn = useServerFn(setUserRole);
  const setActiveFn = useServerFn(setUserActive);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: users, isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn(),
    enabled: me?.role === "admin",
  });

  const [search, setSearch] = useState("");

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: AdminUser["role"] }) => setRoleFn({ data: v }),
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const activeMut = useMutation({
    mutationFn: (v: { userId: string; isActive: boolean }) => setActiveFn({ data: v }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  if (me && me.role !== "admin") {
    return (
      <div className="min-h-screen" style={{ background: "oklch(0.1 0.025 255)" }}>
        <AppHeader me={me} />
        <div className="lg:pl-[220px] pt-14 lg:pt-0 flex items-center justify-center min-h-screen">
          <div className="text-center px-6">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "oklch(0.92 0.005 255)" }}>Access denied</h1>
            <p className="text-sm mb-5" style={{ color: "oklch(0.5 0.02 255)" }}>You need admin access to view this page.</p>
            <Link to="/" className="btn-primary text-sm inline-flex">← Back to composer</Link>
          </div>
        </div>
      </div>
    );
  }

  const filtered = (users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return u.email.toLowerCase().includes(s) || (u.name ?? "").toLowerCase().includes(s) || u.role.includes(s);
  });

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.1 0.025 255)" }}>
      <AppHeader me={me ?? null} />

      <div className="lg:pl-[220px] pt-14 lg:pt-0">
        {/* Top bar */}
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
          <div>
            <h1 className="font-bold text-lg" style={{ color: "oklch(0.92 0.005 255)" }}>User Management</h1>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.02 255)" }}>
              {users?.length ?? 0} member{(users?.length ?? 0) !== 1 ? "s" : ""} registered
            </p>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "oklch(0.45 0.02 255)" }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, role…"
              className="sc-input pl-8"
              style={{ width: "260px" }}
            />
          </div>
        </div>

        <div className="px-6 py-6">
          {isLoading && (
            <div className="text-sm text-center py-10" style={{ color: "oklch(0.45 0.02 255)" }}>
              Loading users…
            </div>
          )}
          {error && (
            <div className="text-sm py-4 px-4 rounded-xl" style={{ background: "oklch(0.35 0.1 25 / 20%)", color: "oklch(0.72 0.18 25)", border: "1px solid oklch(0.5 0.16 25 / 30%)" }}>
              {(error as Error).message}
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="sc-card overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
                      {["User", "Role", "Status", "Delivered", "Failed", "Total", "Last login", "Joined"].map((h) => (
                        <th key={h}
                          className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: "oklch(0.4 0.02 255)", background: "oklch(0.13 0.025 255)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, i) => (
                      <tr
                        key={u.id}
                        style={{ borderBottom: i < filtered.length - 1 ? "1px solid oklch(0.19 0.035 255)" : "none" }}
                        onMouseEnter={(el) => (el.currentTarget.style.background = "oklch(0.15 0.03 255)")}
                        onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
                                style={{ background: "linear-gradient(135deg, oklch(0.62 0.24 280), oklch(0.65 0.22 260))" }}>
                                {(u.name || u.email).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-sm" style={{ color: "oklch(0.88 0.005 255)" }}>
                                {u.name || "—"}
                                {u.id === me?.id && (
                                  <span className="ml-1.5 text-[10px] font-normal" style={{ color: "oklch(0.45 0.02 255)" }}>(you)</span>
                                )}
                              </div>
                              <div className="text-xs" style={{ color: "oklch(0.45 0.02 255)" }}>{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            disabled={u.id === me?.id || roleMut.isPending}
                            onChange={(e) => roleMut.mutate({ userId: u.id, role: e.target.value as AdminUser["role"] })}
                            className="sc-input py-1 px-2 text-xs w-auto"
                            style={{ width: "auto" }}
                          >
                            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <button
                            disabled={u.id === me?.id || activeMut.isPending}
                            onClick={() => activeMut.mutate({ userId: u.id, isActive: !u.is_active })}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                              u.is_active
                                ? "badge-success"
                                : "badge-error"
                            }`}
                          >
                            {u.is_active ? "● Active" : "○ Disabled"}
                          </button>
                        </td>

                        {/* Delivered */}
                        <td className="px-4 py-3">
                          <span className="badge-success">{u.delivered_count}</span>
                        </td>

                        {/* Failed */}
                        <td className="px-4 py-3">
                          <span className={u.failed_count > 0 ? "badge-error" : "text-xs"} style={u.failed_count === 0 ? { color: "oklch(0.4 0.02 255)" } : {}}>
                            {u.failed_count}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-sm font-semibold" style={{ color: "oklch(0.75 0.01 255)" }}>
                          {u.total_sent}
                        </td>

                        {/* Last login */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "oklch(0.45 0.02 255)" }}>
                          {u.last_login ? new Date(u.last_login).toLocaleDateString() : "—"}
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "oklch(0.4 0.02 255)" }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isLoading && filtered.length === 0 && !error && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">👥</div>
              <div className="text-sm" style={{ color: "oklch(0.45 0.02 255)" }}>No users match your search.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
