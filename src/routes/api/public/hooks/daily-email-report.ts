import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint — sends a daily email summary (with CSV attachment) of the
// day's outreach sends (06:00 – 22:00 IST) to every admin.
//
// Auth: caller must pass the Supabase publishable key in the `apikey` header
// (matches pg_cron pattern in Lovable Cloud).

const IST_OFFSET_MIN = 330; // UTC+05:30

function istWindowUtc(now: Date): { fromUtc: string; toUtc: string; dayLabel: string } {
  // Convert `now` to IST wallclock
  const istMs = now.getTime() + IST_OFFSET_MIN * 60 * 1000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  // Full IST day: 00:00:00 IST → 24:00:00 IST (next-day 00:00 IST)
  const fromUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MIN * 60 * 1000);
  const toUtc = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - IST_OFFSET_MIN * 60 * 1000);
  const dayLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { fromUtc: fromUtc.toISOString(), toUtc: toUtc.toISOString(), dayLabel };
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const Route = createFileRoute("/api/public/hooks/daily-email-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Simple shared-key check via apikey header (Supabase publishable key)
        const provided = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "";
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fromUtc, toUtc, dayLabel } = istWindowUtc(new Date());

        // 1) Fetch the day's logs
        const { data: logs, error: logsErr } = await supabaseAdmin
          .from("email_messages")
          .select("id,created_at,user_id,sender_email,recipient_email,recipient_name,subject,template_type,status,failure_reason")
          .gte("created_at", fromUtc)
          .lt("created_at", toUtc)
          .order("created_at", { ascending: true });
        if (logsErr) {
          return new Response(JSON.stringify({ error: logsErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        const rows = ((logs ?? []) as any[]).map((r) => ({
          ...r,
          sent_at: r.created_at,
          error_message: r.failure_reason,
        }));

        // 2) Resolve sender names (user_id -> profile)
        const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
        let profileMap = new Map<string, { name: string | null; email: string }>();
        if (userIds.length > 0) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id,name,email")
            .in("id", userIds);
          for (const p of profs ?? []) profileMap.set(p.id, { name: p.name, email: p.email });
        }

        // 3) Resolve admin recipients
        const { data: adminRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = (adminRoles ?? []).map((r: any) => r.user_id);
        let adminEmails: string[] = [];
        if (adminIds.length > 0) {
          const { data: admins } = await supabaseAdmin
            .from("profiles")
            .select("email,is_active")
            .in("id", adminIds);
          adminEmails = (admins ?? [])
            .filter((a: any) => a.is_active && a.email)
            .map((a: any) => a.email as string);
        }

        // 4) Build aggregates
        const successSet = new Set(["SENT", "DELIVERED_TO_SERVER"]);
        const isOk = (s: string) => successSet.has(s);
        const total = rows.length;
        const sent = rows.filter((r: any) => isOk(r.status)).length;
        const failed = total - sent;

        const perTemplate = new Map<string, { sent: number; failed: number }>();
        const perSender = new Map<string, { name: string; email: string; sent: number; failed: number }>();
        for (const r of rows as any[]) {
          const tKey = r.template_type || "unknown";
          const tAgg = perTemplate.get(tKey) ?? { sent: 0, failed: 0 };
          if (isOk(r.status)) tAgg.sent++; else tAgg.failed++;
          perTemplate.set(tKey, tAgg);

          const prof = profileMap.get(r.user_id);
          const senderName = prof?.name || prof?.email || r.sender_email || "unknown";
          const senderEmail = prof?.email || r.sender_email || "";
          const sKey = r.user_id || senderEmail;
          const sAgg = perSender.get(sKey) ?? { name: senderName, email: senderEmail, sent: 0, failed: 0 };
          if (isOk(r.status)) sAgg.sent++; else sAgg.failed++;
          perSender.set(sKey, sAgg);
        }

        // 5) CSV attachment (one row per send)
        const csv = toCsv(
          rows.map((r: any) => {
            const prof = profileMap.get(r.user_id);
            return {
              sent_at_utc: r.sent_at,
              sender_name: prof?.name ?? "",
              sender_account_email: prof?.email ?? "",
              from_gmail: r.sender_email,
              template: r.template_type,
              subject: r.subject,
              recipient_name: r.recipient_name ?? "",
              recipient_email: r.recipient_email,
              status: r.status,
              error: r.error_message ?? "",
            };
          }),
          [
            "sent_at_utc",
            "sender_name",
            "sender_account_email",
            "from_gmail",
            "template",
            "subject",
            "recipient_name",
            "recipient_email",
            "status",
            "error",
          ],
        );

        // 6) HTML summary
        const tRows = Array.from(perTemplate.entries())
          .sort((a, b) => b[1].sent + b[1].failed - (a[1].sent + a[1].failed))
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${v.sent}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#b91c1c">${v.failed}</td></tr>`,
          )
          .join("");

        const sRows = Array.from(perSender.values())
          .sort((a, b) => b.sent + b.failed - (a.sent + a.failed))
          .map(
            (v) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(v.name)}<div style="color:#64748b;font-size:12px">${escapeHtml(v.email)}</div></td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${v.sent}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#b91c1c">${v.failed}</td></tr>`,
          )
          .join("");

        const istFmt = (iso: string) => {
          const t = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60 * 1000);
          const hh = String(t.getUTCHours()).padStart(2, "0");
          const mm = String(t.getUTCMinutes()).padStart(2, "0");
          return `${hh}:${mm}`;
        };
        const auditRows = (rows as any[])
          .slice()
          .sort((a, b) => (a.sent_at < b.sent_at ? -1 : 1))
          .map((r) => {
            const prof = profileMap.get(r.user_id);
            const senderName = prof?.name || prof?.email || r.sender_email || "unknown";
            const ok = isOk(r.status);
            const statusHtml = ok
              ? `<span style="color:#166534;font-weight:600">Delivered</span>`
              : `<span style="color:#991b1b;font-weight:600">Failed</span>`;
            const recipient = r.recipient_name
              ? `${escapeHtml(r.recipient_name)}<div style="color:#64748b;font-size:12px">${escapeHtml(r.recipient_email)}</div>`
              : escapeHtml(r.recipient_email);
            return `<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#475569;font-variant-numeric:tabular-nums">${istFmt(r.sent_at)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(senderName)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.template_type ?? "—")}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee">${recipient}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee">${statusHtml}${!ok && r.error_message ? `<div style="color:#64748b;font-size:12px">${escapeHtml(String(r.error_message).slice(0, 140))}</div>` : ""}</td>
            </tr>`;
          })
          .join("");

        // Summary aggregates
        const deliveryRate = total > 0 ? Math.round((sent / total) * 1000) / 10 : 0;
        const uniqueRecipients = new Set(rows.map((r: any) => (r.recipient_email || "").toLowerCase()).filter(Boolean)).size;
        const uniqueSenders = perSender.size;
        const uniqueTemplates = perTemplate.size;
        const sortedTimes = rows.map((r: any) => r.sent_at).filter(Boolean).sort();
        const firstSend = sortedTimes[0] ? istFmt(sortedTimes[0]) : "—";
        const lastSend = sortedTimes.length ? istFmt(sortedTimes[sortedTimes.length - 1]) : "—";
        const topTemplate = Array.from(perTemplate.entries())
          .sort((a, b) => b[1].sent + b[1].failed - (a[1].sent + a[1].failed))[0];
        const topSender = Array.from(perSender.values())
          .sort((a, b) => b.sent + b.failed - (a.sent + a.failed))[0];
        const failureReasons = new Map<string, number>();
        for (const r of rows as any[]) {
          if (isOk(r.status)) continue;
          const key = (r.error_message ? String(r.error_message).split("\n")[0].slice(0, 80) : r.status) || "unknown";
          failureReasons.set(key, (failureReasons.get(key) ?? 0) + 1);
        }
        const topFailures = Array.from(failureReasons.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        const summaryLines: string[] = [];
        if (total === 0) {
          summaryLines.push("No emails were sent today.");
        } else {
          summaryLines.push(
            `<b>${total}</b> email${total === 1 ? "" : "s"} attempted — <b style="color:#166534">${sent} delivered</b> and <b style="color:#991b1b">${failed} failed</b> (${deliveryRate}% delivery rate).`,
          );
          summaryLines.push(
            `Reached <b>${uniqueRecipients}</b> unique recipient${uniqueRecipients === 1 ? "" : "s"} across <b>${uniqueTemplates}</b> template${uniqueTemplates === 1 ? "" : "s"}, sent by <b>${uniqueSenders}</b> user${uniqueSenders === 1 ? "" : "s"}.`,
          );
          summaryLines.push(`Activity window: <b>${firstSend}</b> → <b>${lastSend}</b> IST.`);
          if (topSender) {
            summaryLines.push(
              `Most active sender: <b>${escapeHtml(topSender.name)}</b> (${topSender.sent + topSender.failed} sent, ${topSender.sent} delivered).`,
            );
          }
          if (topTemplate) {
            summaryLines.push(
              `Most-used template: <b>${escapeHtml(topTemplate[0])}</b> (${topTemplate[1].sent + topTemplate[1].failed} sent).`,
            );
          }
          if (topFailures.length) {
            const parts = topFailures.map(([k, n]) => `${escapeHtml(k)} × ${n}`).join("; ");
            summaryLines.push(`Top failure reason${topFailures.length === 1 ? "" : "s"}: ${parts}.`);
          }
        }
        const summaryHtml = summaryLines
          .map((l) => `<li style="margin:4px 0;line-height:1.5">${l}</li>`)
          .join("");

        const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
  <div style="max-width:760px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.05)">
    <h2 style="margin:0 0 4px 0;color:#065f46">AICSSYC — Daily Outreach Audit</h2>
    <p style="margin:0 0 16px 0;color:#475569;font-size:14px">${dayLabel} · full day (IST)</p>

    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:110px;background:#ecfdf5;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#065f46">${total}</div>
        <div style="font-size:12px;color:#065f46">Total attempts</div>
      </div>
      <div style="flex:1;min-width:110px;background:#f0fdf4;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#166534">${sent}</div>
        <div style="font-size:12px;color:#166534">Delivered</div>
      </div>
      <div style="flex:1;min-width:110px;background:#fef2f2;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#991b1b">${failed}</div>
        <div style="font-size:12px;color:#991b1b">Failed</div>
      </div>
      <div style="flex:1;min-width:110px;background:#eff6ff;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#1d4ed8">${deliveryRate}%</div>
        <div style="font-size:12px;color:#1d4ed8">Delivery rate</div>
      </div>
      <div style="flex:1;min-width:110px;background:#f5f3ff;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#5b21b6">${uniqueRecipients}</div>
        <div style="font-size:12px;color:#5b21b6">Unique recipients</div>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px">Today's summary</div>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#334155">${summaryHtml}</ul>
    </div>


    <h3 style="margin:16px 0 8px 0;font-size:14px;color:#0f172a">By template</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Template</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #e2e8f0">Delivered</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #e2e8f0">Failed</th></tr></thead>
      <tbody>${tRows || `<tr><td colspan="3" style="padding:10px;color:#64748b">No sends today.</td></tr>`}</tbody>
    </table>

    <h3 style="margin:20px 0 8px 0;font-size:14px;color:#0f172a">By sender</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Person</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #e2e8f0">Delivered</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #e2e8f0">Failed</th></tr></thead>
      <tbody>${sRows || `<tr><td colspan="3" style="padding:10px;color:#64748b">No sends today.</td></tr>`}</tbody>
    </table>

    <h3 style="margin:24px 0 8px 0;font-size:14px;color:#0f172a">Audit log — every send</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Time (IST)</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Sender</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Template</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Recipient</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0">Status</th>
      </tr></thead>
      <tbody>${auditRows || `<tr><td colspan="5" style="padding:10px;color:#64748b">No sends today.</td></tr>`}</tbody>
    </table>

    <p style="margin-top:20px;font-size:13px;color:#475569">Full per-email log also attached as <b>aicssyc-outreach-${dayLabel}.csv</b>.</p>
  </div>
</body></html>`;

        // 7) Send to admins (skip send if none configured / no logs & no admins)
        if (adminEmails.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, note: "No admin recipients configured.", total, sent, failed }),
            { headers: { "content-type": "application/json" } },
          );
        }

        const from = process.env.GMAIL_USER;
        if (!from) {
          return new Response(JSON.stringify({ error: "GMAIL_USER not configured" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const { createMailer } = await import("@/lib/email-transport.server");
        const mailer = await createMailer();
        const results: Array<{ to: string; ok: boolean; error?: string }> = [];
        try {
          for (const to of adminEmails) {
            try {
              await mailer.send({
                from,
                to,
                subject: `AICSSYC Daily Report — ${dayLabel} (${sent}/${total} delivered)`,
                html,
                messageId: `<report-${dayLabel}-${crypto.randomUUID()}@${process.env.VERCEL_URL || process.env.APP_URL?.replace(/^https?:\/\//, '') || "localhost"}>`,
                attachments: [
                  {
                    filename: `aicssyc-outreach-${dayLabel}.csv`,
                    content: csv,
                    contentType: "text/csv",
                  },
                ],
              });
              results.push({ to, ok: true });
            } catch (e: any) {
              results.push({ to, ok: false, error: e?.message ?? "send failed" });
            }
          }
        } finally {
          await mailer.close().catch(() => {});
        }

        return new Response(
          JSON.stringify({ ok: true, day: dayLabel, total, sent, failed, admins: adminEmails.length, results }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
