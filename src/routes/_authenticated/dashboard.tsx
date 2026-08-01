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
    background: "var(--paper)",
    border: "2.5px solid var(--ink)",
    borderRadius: "0",
    color: "var(--ink)",
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "12px",
    boxShadow: "3px 3px 0 var(--ink)",
  },
  cursor: { fill: "rgba(0,0,0,0.05)" },
};

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="sc-card flex items-start gap-4">
      <div
        className="w-10 h-10 flex items-center justify-center shrink-0"
        style={{ border: "2px solid var(--ink)", background: "var(--paper-dark)" }}
      >
        {icon}
      </div>
      <div>
        <div className="font-mono text-[10px] tracking-widest mb-0.5 text-muted-foreground uppercase">
          {label}
        </div>
        <div className="font-brutalist text-3xl">
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
    <div className="min-h-screen bg-[var(--cream)]">
      <AppHeader me={me ?? null} />

      <div className="lg:pl-[220px] pt-14 lg:pt-0" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Top bar */}
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderBottom: "3px solid var(--ink)", background: "var(--paper)" }}>
          <div>
            <h1 className="font-brutalist text-2xl tracking-widest">DASHBOARD</h1>
            <p className="font-mono text-xs mt-0.5 text-muted-foreground">
              {isAdmin ? "All outreach activity across the team." : "Your personal outreach activity."}
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visibleEmails.length === 0}
            className="btn-stamp-ghost"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            EXPORT CSV
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-auto" style={{ maxHeight: "calc(100vh - 70px)" }}>
          {/* Stat cards */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Total delivered"
                value={stats.total}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
              />
              <StatCard
                label="Today"
                value={stats.today}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              />
              <StatCard
                label="This month"
                value={stats.thisMonth}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
              />
              <StatCard
                label="Templates used"
                value={templateOptions.length}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              />
            </div>
          )}

          {/* Charts (admin) */}
          {isAdmin && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="sc-card !p-0 overflow-hidden">
                <div className="sc-card-header">SENDS BY TEMPLATE</div>
                <div className="p-4">
                  {templateChart.length === 0 ? (
                    <div className="flex h-44 items-center justify-center font-mono text-sm text-muted-foreground">
                      No data yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={templateChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ink)" opacity={0.2} />
                        <XAxis dataKey="template" tick={{ fontSize: 11, fill: "var(--ink)" }} fontFamily="'JetBrains Mono', monospace" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--ink)" }} fontFamily="'JetBrains Mono', monospace" />
                        <Tooltip {...CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="count" fill="var(--rust)" radius={[0, 0, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="sc-card !p-0 overflow-hidden">
                <div className="sc-card-header">SENDS OVER TIME</div>
                <div className="p-4">
                  {dateChart.length === 0 ? (
                    <div className="flex h-44 items-center justify-center font-mono text-sm text-muted-foreground">
                      No data yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={dateChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ink)" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ink)" }} fontFamily="'JetBrains Mono', monospace" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--ink)" }} fontFamily="'JetBrains Mono', monospace" />
                        <Tooltip {...CHART_TOOLTIP_STYLE} />
                        <Line type="monotone" dataKey="count" stroke="var(--ink)" strokeWidth={3} dot={{ r: 4, fill: "var(--rust)", strokeWidth: 2, stroke: "var(--ink)" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="sc-card">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
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
              <label className="flex items-center gap-2 font-mono text-xs">
                FROM
                <input type="date" value={dateRange.from}
                  onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                  className="sc-input flex-1" />
              </label>
              <label className="flex items-center gap-2 font-mono text-xs">
                TO
                <input type="date" value={dateRange.to}
                  onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                  className="sc-input flex-1" />
              </label>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setDateRange({ from: "", to: "" }); setSearch(""); setTemplateFilter(""); setRecipientFilter(""); setSentByFilter(""); }}
                  className="font-brutalist text-sm text-[var(--rust)] hover:underline"
                >
                  ✕ RESET FILTERS
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="sc-card overflow-hidden !p-0">
            {isLoading && (
              <div className="p-6 font-mono text-sm text-center">Loading…</div>
            )}
            {!isLoading && visibleEmails.length === 0 && (
              <div className="p-10 text-center">
                <div className="text-2xl mb-2">📭</div>
                <div className="font-mono text-sm text-muted-foreground">No emails match these filters.</div>
              </div>
            )}
            {visibleEmails.length > 0 && (
              <div className="overflow-x-auto">
                <table className="sc-table">
                  <thead>
                    <tr>
                      {["When", "Status", "Template", "Recipient", "Sent By", ""].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmails.map((e) => (
                      <tr key={e.id}>
                        <td className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td>
                          <span className={e.status === "DELIVERED_TO_SERVER" || e.status === "SENT" ? "badge-success" : "badge-error"}>
                            {humanStatusLabel(e.status).toUpperCase()}
                          </span>
                        </td>
                        <td className="capitalize font-mono text-xs">
                          {e.template_type ?? "—"}
                        </td>
                        <td>
                          <div className="font-bold text-sm">
                            {e.recipient_name || "—"}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {e.recipient_email}
                          </div>
                        </td>
                        <td className="font-mono text-xs text-muted-foreground">
                          {e.sent_by_name || e.sent_by_email || "—"}
                        </td>
                        <td>
                          <Link to="/emails/$id" params={{ id: e.id }}
                            className="font-brutalist text-lg hover:underline"
                            style={{ color: "var(--rust)" }}
                          >
                            VIEW →
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
