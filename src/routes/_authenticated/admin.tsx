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
      { title: "Admin — AICSSYC Outreach" },
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
    mutationFn: (v: { userId: string; role: AdminUser["role"] }) =>
      setRoleFn({ data: v }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const activeMut = useMutation({
    mutationFn: (v: { userId: string; isActive: boolean }) =>
      setActiveFn({ data: v }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  if (me && me.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader me={me} />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Access denied</h1>
          <p className="mt-2 text-slate-600">You need admin access to view this page.</p>
          <Link to="/" className="mt-4 inline-block text-amber-600 hover:underline">← Back to composer</Link>
        </main>
      </div>
    );
  }

  const filtered = (users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(s) ||
      (u.name ?? "").toLowerCase().includes(s) ||
      u.role.includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader me={me ?? null} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User management</h1>
            <p className="text-sm text-slate-500">
              {users?.length ?? 0} user{(users?.length ?? 0) === 1 ? "" : "s"} total
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or role…"
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>

        {isLoading && <div className="text-sm text-slate-500">Loading users…</div>}
        {error && <div className="text-sm text-rose-600">{(error as Error).message}</div>}

        {!isLoading && filtered.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3">Failed / bounced</th>
                  <th className="px-4 py-3">Total sent</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {(u.name || u.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-900">{u.name || "—"}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={u.id === me?.id || roleMut.isPending}
                        onChange={(e) =>
                          roleMut.mutate({ userId: u.id, role: e.target.value as AdminUser["role"] })
                        }
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-60"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      {u.id === me?.id && <div className="mt-0.5 text-[10px] text-slate-400">(you)</div>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={u.id === me?.id || activeMut.isPending}
                        onClick={() => activeMut.mutate({ userId: u.id, isActive: !u.is_active })}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          u.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {u.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {u.delivered_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          u.failed_count > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {u.failed_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{u.total_sent}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
