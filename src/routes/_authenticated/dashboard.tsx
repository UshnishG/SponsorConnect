import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { getMe } from "@/lib/auth.functions";
import { listMyEmails, getMyEmailStats } from "@/lib/email-logs.functions";
import { humanStatusLabel } from "@/lib/bounce-classifier";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — AICSSYC Outreach" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Stat({ label, value, tone = "slate" }: { label: string; value: number | string; tone?: string }) {
  const toneCls: Record<string, string> = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
  };
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls[tone] ?? toneCls.slate}`}>{value}</div>
    </div>
  );
}

function DashboardPage() {
  const meFn = useServerFn(getMe);
  const listFn = useServerFn(listMyEmails);
  const statsFn = useServerFn(getMyEmailStats);

  // Server-side date range filter (limits the query)
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: stats } = useQuery({ queryKey: ["dashboard", "stats"], queryFn: () => statsFn() });
  const { data: emails, isLoading } = useQuery({
    queryKey: ["dashboard", "list", dateRange],
    queryFn: () => listFn({ data: { ...dateRange, limit: 500 } }),
  });

  const isAdmin = me?.role === "admin";

  // Client-side filters
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("");
  const [recipientFilter, setRecipientFilter] = useState("");
  const [sentByFilter, setSentByFilter] = useState("");

  const templateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of emails ?? []) if (e.template_type) set.add(e.template_type);
    return Array.from(set).sort();
  }, [emails]);

  const sentByOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of emails ?? []) {
      map.set(e.user_id, e.sent_by_name || e.sent_by_email || e.user_id.slice(0, 8));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [emails]);

  const visibleEmails = useMemo(() => {
    const s = search.trim().toLowerCase();
    const r = recipientFilter.trim().toLowerCase();
    return (emails ?? []).filter((e) => {
      if (templateFilter && e.template_type !== templateFilter) return false;
      if (sentByFilter && e.user_id !== sentByFilter) return false;
      if (r && !`${e.recipient_email} ${e.recipient_name ?? ""}`.toLowerCase().includes(r)) return false;
      if (s) {
        const hay = `${e.subject} ${e.recipient_email} ${e.recipient_name ?? ""} ${e.sent_by_name ?? ""} ${e.sent_by_email ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [emails, search, templateFilter, sentByFilter, recipientFilter]);

  // ---------- Charts (admin only) ----------
  const templateChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of visibleEmails) {
      const k = e.template_type || "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map, ([template, count]) => ({ template, count })).sort((a, b) => b.count - a.count);
  }, [visibleEmails]);


  const dateChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of visibleEmails) {
      const d = new Date(e.created_at).toISOString().slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return Array.from(map, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }, [visibleEmails]);

  const downloadCsv = () => {
    if (visibleEmails.length === 0) return;
    const headers = ["When", "Status", "Template", "Recipient Name", "Recipient Email", "Sent By Name", "Sent By Email", "Subject"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = visibleEmails.map((e) =>
      [
        new Date(e.created_at).toISOString(),
        humanStatusLabel(e.status),
        e.template_type ?? "",
        e.recipient_name ?? "",
        e.recipient_email,
        e.sent_by_name ?? "",
        e.sent_by_email ?? "",
        e.subject,
      ].map(escape).join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader me={me ?? null} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Email dashboard</h1>
            <p className="text-sm text-slate-500">
              {isAdmin ? "All delivered outreach across the team." : "Your delivered outreach."}
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visibleEmails.length === 0}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download CSV
          </button>
        </div>

        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total delivered" value={stats.total} tone="emerald" />
            <Stat label="Today" value={stats.today} tone="blue" />
            <Stat label="This month" value={stats.thisMonth} />
            <Stat label="Unique templates" value={templateOptions.length} tone="amber" />
          </div>
        )}

        {isAdmin && (
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Sends by template">
              {templateChart.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={templateChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="template" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Sends over time">
              {dateChart.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={dateChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border bg-white p-3 shadow-sm md:grid-cols-3 lg:grid-cols-6">
          <input
            placeholder="Search subject, recipient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm md:col-span-2"
          />
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All templates</option>
            {templateOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            placeholder="Recipient contains…"
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
          {isAdmin && (
            <select
              value={sentByFilter}
              onChange={(e) => setSentByFilter(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All senders</option>
              {sentByOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2 md:col-span-3 lg:col-span-6">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              From
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              To
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            {(dateRange.from || dateRange.to || search || templateFilter || recipientFilter || sentByFilter) && (
              <button
                type="button"
                onClick={() => {
                  setDateRange({ from: "", to: "" });
                  setSearch("");
                  setTemplateFilter("");
                  setRecipientFilter("");
                  setSentByFilter("");
                }}
                className="ml-auto text-xs text-slate-500 hover:text-slate-800"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {isLoading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
          {!isLoading && visibleEmails.length === 0 && (
            <div className="p-6 text-sm text-slate-500">No emails match these filters.</div>
          )}
          {visibleEmails.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Template</th>
                    <th className="px-4 py-2">Recipient Name</th>
                    <th className="px-4 py-2">Recipient Email</th>
                    <th className="px-4 py-2">Sent By</th>
                    <th className="px-4 py-2">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleEmails.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {humanStatusLabel(e.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2 capitalize text-slate-700">{e.template_type ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{e.recipient_name || "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{e.recipient_email}</td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {e.sent_by_name || e.sent_by_email || "—"}
                        {e.sent_by_name && e.sent_by_email && (
                          <div className="text-[10px] text-slate-400">{e.sent_by_email}</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          to="/emails/$id"
                          params={{ id: e.id }}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 text-sm font-semibold text-slate-700">{title}</div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">No data</div>;
}
