import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { getMe } from "@/lib/auth.functions";
import { getEmailById } from "@/lib/email-logs.functions";
import { humanStatusLabel } from "@/lib/bounce-classifier";
import { buildEmailHtml } from "@/lib/email-template";

export const Route = createFileRoute("/_authenticated/emails/$id")({
  component: EmailDetailPage,
  head: () => ({ meta: [{ title: "Email — AICSSYC" }, { name: "robots", content: "noindex" }] }),
});


function EmailDetailPage() {
  const { id } = Route.useParams();
  const meFn = useServerFn(getMe);
  const getFn = useServerFn(getEmailById);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { data: email, isLoading, error } = useQuery({
    queryKey: ["emails", "detail", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const [view, setView] = useState<"formatted" | "source">("formatted");

  const formattedHtml = useMemo(() => {
    if (!email) return "";
    return buildEmailHtml({
      templateType: email.template_type ?? "",
      markdownBody: email.body || "",
      recipientName: email.recipient_name ?? undefined,
    });
  }, [email]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader me={me ?? null} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link to="/dashboard" className="text-sm text-slate-500 hover:text-slate-800">← Back to dashboard</Link>


        {isLoading && <div className="mt-4 text-sm text-slate-500">Loading…</div>}
        {error && <div className="mt-4 text-sm text-rose-600">{(error as Error).message}</div>}
        {email === null && <div className="mt-4 text-sm text-slate-500">Email not found.</div>}

        {email && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Recipient</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {email.recipient_name || email.recipient_email}
                  </div>
                  {email.recipient_name && (
                    <div className="text-sm text-slate-500">{email.recipient_email}</div>
                  )}
                </div>
                <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  {humanStatusLabel(email.status)}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Field label="Subject" value={email.subject} />
                <Field label="Sent at" value={new Date(email.created_at).toLocaleString()} />
                <Field label="Template" value={email.template_type ?? "—"} />
                <Field label="From" value={email.sender_email} />
                <Field label="Message ID" value={email.gmail_message_id ?? "—"} mono />
                <Field label="Bounce checked" value={email.bounce_checked_at ? new Date(email.bounce_checked_at).toLocaleString() : "—"} />
                {email.failure_reason && <Field label="Failure reason" value={email.failure_reason} />}
                {email.smtp_response && <Field label="SMTP response" value={email.smtp_response} mono full />}
              </dl>
            </div>

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message body</div>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setView("formatted")}
                    className={`rounded px-2 py-1 font-medium ${
                      view === "formatted" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Formatted
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("source")}
                    className={`rounded px-2 py-1 font-medium ${
                      view === "source" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Markdown
                  </button>
                </div>
              </div>
              {view === "formatted" ? (
                email.body ? (
                  <iframe
                    title="Email preview"
                    srcDoc={formattedHtml}
                    sandbox=""
                    className="w-full rounded border border-slate-200 bg-white"
                    style={{ height: "800px" }}
                  />
                ) : (
                  <div className="text-sm text-slate-500">(empty)</div>
                )
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm text-slate-800 font-sans">
                  {email.body || "(empty)"}
                </pre>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 break-words text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
