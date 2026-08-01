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
      { title: "Dashboard — SponsorConnect" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "oklch(0.16 0.03 255)",
    border: "1px solid oklch(0.28 0.05 255 / 60%)",
    borderRadius: "10px",
    color: "oklch(0.88 0.005 255)",
    fontSize: "12px",
  },
  cursor: { fill: "oklch(0.68 0.22 275 / 8%)" },
};

function StatCard({
  label,
  value,
  icon,
  accent,
  glowClass,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  glowClass: string;
}) {
  return (
    <div
      className={`sc-card flex items-start gap-4 ${glowClass} transition-transform hover:-translate-y-0.5`}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${accent}20`, border: `1px solid ${accent}40`, color: accent }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "oklch(0.45 0.02 255)" }}>
          {label}
        </div>
        <div className="text-2xl font-bold" style={{ color: "oklch(0.92 0.005 255)" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function DashboardPage() {
  const meFn = useServerFn(getMe);
  const listFn = useServerFn(listMyEmails);
  const statsFn = useServerFn(getMyEmailStats);

  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: stats } = useQuery({ queryKey: ["dashboard", "stats"], queryFn: () => statsFn() });
  const { data: emails, isLoading } = useQuery({
    queryKey: ["dashboard", "list", dateRange],
    queryFn: () => listFn({ data: { ...dateRange, limit: 500 } }),
  });

  const isAdmin = me?.role === "admin";
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

  const hasFilters = dateRange.from || dateRange.to || search || templateFilter || recipientFilter || sentByFilter;

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.1 0.025 255)" }}>
      <AppHeader me={me ?? null} />

      <div className="lg:pl-[220px] pt-14 lg:pt-0">
        {/* Top bar */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
          <div>
            <h1 className="font-bold text-lg" style={{ color: "oklch(0.92 0.005 255)" }}>Dashboard</h1>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.02 255)" }}>
              {isAdmin ? "All outreach activity across the team." : "Your personal outreach activity."}
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visibleEmails.length === 0}
            className="btn-ghost text-xs flex items-center gap-2"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 overflow-auto" style={{ maxHeight: "calc(100vh - 57px)" }}>
          {/* Stat cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Total delivered"
                value={stats.total}
                glowClass="stat-glow-emerald"
                accent="oklch(0.65 0.16 160)"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
              />
              <StatCard
                label="Today"
                value={stats.today}
                glowClass="stat-glow-blue"
                accent="oklch(0.65 0.18 240)"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              />
              <StatCard
                label="This month"
                value={stats.thisMonth}
                glowClass="stat-glow-purple"
                accent="oklch(0.68 0.22 275)"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
              />
              <StatCard
                label="Templates used"
                value={templateOptions.length}
                glowClass="stat-glow-amber"
                accent="oklch(0.78 0.18 80)"
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              />
            </div>
          )}

          {/* Charts (admin) */}
          {isAdmin && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="sc-card">
                <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "oklch(0.45 0.02 255)" }}>
                  Sends by template
                </div>
                {templateChart.length === 0 ? (
                  <div className="flex h-44 items-center justify-center text-sm" style={{ color: "oklch(0.35 0.02 255)" }}>
                    No data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={templateChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.04 255)" />
                      <XAxis dataKey="template" tick={{ fontSize: 11, fill: "oklch(0.5 0.02 255)" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "oklch(0.5 0.02 255)" }} />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill="oklch(0.68 0.22 275)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="sc-card">
                <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "oklch(0.45 0.02 255)" }}>
                  Sends over time
                </div>
                {dateChart.length === 0 ? (
                  <div className="flex h-44 items-center justify-center text-sm" style={{ color: "oklch(0.35 0.02 255)" }}>
                    No data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dateChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.04 255)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.5 0.02 255)" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "oklch(0.5 0.02 255)" }} />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="count" stroke="oklch(0.65 0.18 240)" strokeWidth={2.5} dot={{ r: 4, fill: "oklch(0.65 0.18 240)" }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="sc-card">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-4">
              <input
                placeholder="Search subject, recipient…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sc-input md:col-span-2"
              />
              <select
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                className="sc-input"
              >
                <option value="">All templates</option>
                {templateOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                placeholder="Filter by recipient…"
                value={recipientFilter}
                onChange={(e) => setRecipientFilter(e.target.value)}
                className="sc-input"
              />
              {isAdmin && (
                <select
                  value={sentByFilter}
                  onChange={(e) => setSentByFilter(e.target.value)}
                  className="sc-input"
                >
                  <option value="">All senders</option>
                  {sentByOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.5 0.02 255)" }}>
                From
                <input type="date" value={dateRange.from}
                  onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                  className="sc-input flex-1" />
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.5 0.02 255)" }}>
                To
                <input type="date" value={dateRange.to}
                  onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                  className="sc-input flex-1" />
              </label>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setDateRange({ from: "", to: "" }); setSearch(""); setTemplateFilter(""); setRecipientFilter(""); setSentByFilter(""); }}
                  className="text-xs transition-colors"
                  style={{ color: "oklch(0.55 0.15 25)" }}
                >
                  ✕ Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="sc-card overflow-hidden !p-0">
            {isLoading && (
              <div className="p-6 text-sm text-center" style={{ color: "oklch(0.45 0.02 255)" }}>Loading…</div>
            )}
            {!isLoading && visibleEmails.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-2xl mb-2">📭</div>
                <div className="text-sm" style={{ color: "oklch(0.45 0.02 255)" }}>No emails match these filters.</div>
              </div>
            )}
            {visibleEmails.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
                      {["When", "Status", "Template", "Recipient", "Sent By", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: "oklch(0.4 0.02 255)", background: "oklch(0.13 0.025 255)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmails.map((e, i) => (
                      <tr
                        key={e.id}
                        style={{
                          borderBottom: i < visibleEmails.length - 1 ? "1px solid oklch(0.19 0.035 255)" : "none",
                        }}
                        onMouseEnter={(el) => (el.currentTarget.style.background = "oklch(0.15 0.03 255)")}
                        onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "oklch(0.45 0.02 255)" }}>
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={e.status === "delivered" || e.status === "sent" ? "badge-success" : "badge-error"}>
                            {humanStatusLabel(e.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 capitalize text-xs" style={{ color: "oklch(0.65 0.02 255)" }}>
                          {e.template_type ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium" style={{ color: "oklch(0.8 0.01 255)" }}>
                            {e.recipient_name || "—"}
                          </div>
                          <div className="text-[11px]" style={{ color: "oklch(0.45 0.02 255)" }}>
                            {e.recipient_email}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "oklch(0.55 0.02 255)" }}>
                          {e.sent_by_name || e.sent_by_email || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Link to="/emails/$id" params={{ id: e.id }}
                            className="text-xs font-semibold transition-colors"
                            style={{ color: "oklch(0.68 0.22 275)" }}
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
