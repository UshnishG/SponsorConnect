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
      <div className="min-h-screen">
        <AppHeader me={me} />
        <div className="lg:pl-[220px] pt-14 lg:pt-0 flex items-center justify-center min-h-screen">
          <div className="text-center px-6 sc-card-heavy">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="font-display text-3xl font-bold mb-2">ACCESS DENIED</h1>
            <p className="font-mono text-sm mb-5 text-muted-foreground">You need admin access to view this page.</p>
            <Link to="/" className="btn-stamp inline-flex">← Back to composer</Link>
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
    <div className="min-h-screen">
      <AppHeader me={me ?? null} />

      <div className="lg:pl-[220px] pt-14 lg:pt-0" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Top bar */}
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderBottom: "3px solid var(--ink)", background: "var(--paper)" }}>
          <div>
            <h1 className="font-brutalist text-2xl tracking-widest">USER MANAGEMENT</h1>
            <p className="font-mono text-xs mt-0.5 text-muted-foreground">
              {users?.length ?? 0} member{(users?.length ?? 0) !== 1 ? "s" : ""} registered
            </p>
          </div>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="sc-input"
              style={{ width: "260px" }}
            />
          </div>
        </div>

        <div className="p-6 flex-1 bg-[var(--cream)]">
          {isLoading && (
            <div className="font-mono text-sm text-center py-10">
              Loading users…
            </div>
          )}
          
          {error && (
            <div className="sc-card-heavy font-mono text-sm" style={{ background: "#f5ddd8", color: "var(--rust)" }}>
              {(error as Error).message}
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="sc-card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="sc-table">
                  <thead>
                    <tr>
                      {["User", "Role", "Status", "Delivered", "Failed", "Total", "Last login", "Joined"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id}>
                        {/* User */}
                        <td>
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="h-8 w-8 object-cover shrink-0" style={{ border: "2px solid var(--ink)" }} />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center text-xs font-bold shrink-0"
                                style={{ background: "var(--rust)", color: "var(--cream)", border: "2px solid var(--ink)" }}>
                                {(u.name || u.email).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-sm">
                                {u.name || "—"}
                                {u.id === me?.id && (
                                  <span className="ml-1.5 font-mono text-[10px]">(you)</span>
                                )}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td>
                          <select
                            value={u.role}
                            disabled={u.id === me?.id || roleMut.isPending}
                            onChange={(e) => roleMut.mutate({ userId: u.id, role: e.target.value as AdminUser["role"] })}
                            className="sc-input py-1 px-2 text-xs w-auto"
                          >
                            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>

                        {/* Status */}
                        <td>
                          <button
                            disabled={u.id === me?.id || activeMut.isPending}
                            onClick={() => activeMut.mutate({ userId: u.id, isActive: !u.is_active })}
                            className={u.is_active ? "badge-success" : "badge-neutral"}
                            style={{ cursor: u.id === me?.id ? "not-allowed" : "pointer" }}
                          >
                            {u.is_active ? "ACTIVE" : "DISABLED"}
                          </button>
                        </td>

                        {/* Delivered */}
                        <td>
                          <span className="badge-success">{u.delivered_count}</span>
                        </td>

                        {/* Failed */}
                        <td>
                          {u.failed_count > 0 ? (
                            <span className="badge-error">{u.failed_count}</span>
                          ) : (
                            <span className="font-mono text-xs">0</span>
                          )}
                        </td>

                        {/* Total */}
                        <td className="font-brutalist text-lg">
                          {u.total_sent}
                        </td>

                        {/* Last login */}
                        <td className="font-mono text-xs whitespace-nowrap">
                          {u.last_login ? new Date(u.last_login).toLocaleDateString() : "—"}
                        </td>

                        {/* Joined */}
                        <td className="font-mono text-xs whitespace-nowrap">
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
            <div className="text-center py-16 sc-card">
              <div className="text-4xl mb-3">👥</div>
              <div className="font-mono text-sm">No users match your search.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
