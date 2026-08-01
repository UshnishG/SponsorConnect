// BounceMonitor cron endpoint.
// Called every minute via pg_cron. Connects to Gmail IMAP with an App
// Password, searches for unseen bounce/DSN messages, parses them, and
// updates matching rows in `email_messages`.
//
// Auth: apikey header must match Supabase publishable key.

import { createFileRoute } from "@tanstack/react-router";
import { fetchBounceMessages } from "@/lib/imap.server";
import { parseBounceMessage } from "@/lib/dsn-parser.server";
import { classifyFailure, humanStatusLabel } from "@/lib/bounce-classifier";

const RUN_MUTEX_KEY = "__bounceMonitorRunning";

export const Route = createFileRoute("/api/public/hooks/bounce-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "";
        if (!expected || provided !== expected) {
          return json({ error: "unauthorized" }, 401);
        }

        const g = globalThis as any;
        if (g[RUN_MUTEX_KEY]) {
          return json({ ok: true, skipped: "already running" });
        }
        g[RUN_MUTEX_KEY] = true;

        try {
          const user = process.env.GMAIL_USER;
          const password = process.env.GMAIL_APP_PASSWORD;
          if (!user || !password) return json({ error: "GMAIL_USER/GMAIL_APP_PASSWORD missing" }, 500);

          console.log("[IMAP] connecting to imap.gmail.com...");
          let messages;
          try {
            messages = await fetchBounceMessages({ user, password, maxMessages: 25 });
          } catch (e: any) {
            console.error("[IMAP] connection/fetch failed:", e);
            return json({ ok: false, error: e?.message ?? "imap error" }, 500);
          }
          console.log(`[IMAP] found ${messages.length} bounce candidates`);

          if (messages.length === 0) return json({ ok: true, checked: 0, updated: 0 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let updated = 0;
          const details: any[] = [];
          type BounceRecord = {
            recipient: string;
            recipientName: string | null;
            status: string;
            reason: string;
          };
          const bouncesByUser = new Map<string, BounceRecord[]>();

          for (const msg of messages) {
            try {
              const parsed = parseBounceMessage(msg.raw);
              const diag = parsed.diagnostic || parsed.statusCode || "";
              const classified = classifyFailure(diag);

              // Match by Message-ID (preferred), else by recipient + recent time window.
              let matched: {
                id: string;
                user_id: string;
                recipient_email: string;
                recipient_name: string | null;
              } | null = null;
              if (parsed.originalMessageId) {
                const { data } = await supabaseAdmin
                  .from("email_messages")
                  .select("id,user_id,recipient_email,recipient_name")
                  .eq("gmail_message_id", parsed.originalMessageId)
                  .maybeSingle();
                matched = (data as any) ?? null;
              }
              if (!matched && parsed.recipient) {
                const since = new Date(Date.now() - 7 * 86400_000).toISOString();
                const { data } = await supabaseAdmin
                  .from("email_messages")
                  .select("id,user_id,recipient_email,recipient_name")
                  .eq("recipient_email", parsed.recipient.toLowerCase())
                  .in("status", ["SENT", "DELIVERED_TO_SERVER", "SENDING"])
                  .gte("created_at", since)
                  .order("created_at", { ascending: false })
                  .limit(1);
                matched = ((data ?? [])[0] as any) ?? null;
              }

              if (!matched) {
                details.push({ uid: msg.uid, matched: false, recipient: parsed.recipient });
                continue;
              }

              const { error: updErr } = await supabaseAdmin
                .from("email_messages")
                .update({
                  status: classified.status,
                  failure_reason: classified.reason,
                  smtp_response: diag || parsed.statusCode,
                  processed: true,
                  bounce_checked_at: new Date().toISOString(),
                })
                .eq("id", matched.id);
              if (updErr) {
                console.error(`[IMAP] update failed for ${matched.id}:`, updErr);
                details.push({ uid: msg.uid, matched: true, id: matched.id, error: updErr.message });
                continue;
              }
              updated++;
              const list = bouncesByUser.get(matched.user_id) ?? [];
              list.push({
                recipient: matched.recipient_email,
                recipientName: matched.recipient_name,
                status: classified.status,
                reason: classified.reason,
              });
              bouncesByUser.set(matched.user_id, list);
              details.push({
                uid: msg.uid,
                matched: true,
                id: matched.id,
                status: classified.status,
                recipient: parsed.recipient,
              });
              console.log(
                `[IMAP] bounce for ${parsed.recipient} -> ${classified.status} (${classified.reason})`,
              );
            } catch (e: any) {
              console.error(`[IMAP] failed to process UID ${msg.uid}:`, e);
              details.push({ uid: msg.uid, error: e?.message });
            }
          }

          // Also mark any lingering SENT rows older than 24h as DELIVERED_TO_SERVER
          // (no bounce received in bounce window → assume it landed on recipient MTA).
          const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
          await supabaseAdmin
            .from("email_messages")
            .update({ status: "DELIVERED_TO_SERVER", bounce_checked_at: new Date().toISOString() })
            .eq("status", "SENT")
            .lt("created_at", cutoff);

          // Notify each sender about their bounces in this batch.
          const notifications: any[] = [];
          if (bouncesByUser.size > 0) {
            let mailer;
            try {
              const { createMailer } = await import("@/lib/email-transport.server");
              mailer = await createMailer();
            } catch (e: any) {
              console.error("[IMAP] notification mailer unavailable:", e?.message);
            }
            if (mailer) {
              for (const [uid, bounces] of bouncesByUser) {
                try {
                  const { data: prof } = await supabaseAdmin
                    .from("profiles")
                    .select("email,name")
                    .eq("id", uid)
                    .maybeSingle();
                  if (!prof?.email) {
                    notifications.push({ user_id: uid, sent: false, reason: "no profile email" });
                    continue;
                  }
                  const rows = bounces
                    .map(
                      (b) => `
                      <tr>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(b.recipientName ?? "—")}</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><code>${escapeHtml(b.recipient)}</code></td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#b91c1c;">${escapeHtml(humanStatusLabel(b.status))}</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${escapeHtml(b.reason)}</td>
                      </tr>`,
                    )
                    .join("");
                  const html = `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;">
                      <h2 style="margin:0 0 8px;color:#111;">Some of your emails bounced</h2>
                      <p style="margin:0 0 16px;color:#555;">
                        Hi ${escapeHtml(prof.name || "there")}, ${bounces.length} email${bounces.length === 1 ? "" : "s"} you recently sent through IEEE Computer Society Outreach could not be delivered. Please try to find updated email addresses for the recipients below and resend.
                      </p>
                      <table style="width:100%;border-collapse:collapse;font-size:14px;">
                        <thead>
                          <tr style="background:#f8fafc;text-align:left;">
                            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Name</th>
                            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Email</th>
                            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Status</th>
                            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Reason</th>
                          </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                      </table>
                      <p style="margin:20px 0 0;color:#555;font-size:13px;">
                        View full details in your <a href="https://outreachieee.lovable.app/emails" style="color:#2563eb;">Email log</a>.
                      </p>
                      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">— IEEE Computer Society Outreach, AICSSYC</p>
                    </div>`;
                  const from = process.env.GMAIL_USER!;
                  await mailer.send({
                    from: `IEEE CS Outreach <${from}>`,
                    to: prof.email,
                    subject: `${bounces.length} email${bounces.length === 1 ? "" : "s"} bounced — please update recipient${bounces.length === 1 ? "" : "s"}`,
                    html,
                    messageId: `<bounce-notify-${crypto.randomUUID()}@outreachieee.lovable.app>`,
                  });
                  notifications.push({ user_id: uid, to: prof.email, sent: true, count: bounces.length });
                } catch (e: any) {
                  console.error(`[IMAP] notify failed for user ${uid}:`, e?.message);
                  notifications.push({ user_id: uid, sent: false, error: e?.message });
                }
              }
              await mailer.close().catch(() => {});
            }
          }

          return json({ ok: true, checked: messages.length, updated, details, notifications });
        } finally {
          g[RUN_MUTEX_KEY] = false;
        }
      },
    },
  },
});

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
