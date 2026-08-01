import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { sendOutreachEmail } from "@/lib/email.functions";
import { getMe } from "@/lib/auth.functions";
import { listEmailTemplates, type EmailTemplate } from "@/lib/templates.functions";
import { buildEmailHtml, type TemplateType } from "@/lib/email-template";
import { AppHeader } from "@/components/AppHeader";
import { RichMarkdownEditor } from "@/components/RichMarkdownEditor";
import { TemplateManagerModal } from "@/components/TemplateManagerModal";

export const Route = createFileRoute("/_authenticated/")({
  component: Composer,
  head: () => ({
    meta: [
      { title: "AICSSYC Outreach Composer" },
      { name: "description", content: "Compose and send branded AICSSYC outreach emails." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const AMBASSADOR_STARTER = `We hope this message finds you well.

We are reaching out from **IEEE Computer Society – SRMIST** to invite you to join **AICSSYC 2026** as a **Campus Ambassador / Community Partner**.

**What you'll do:**
- Represent AICSSYC on your campus / in your community
- Share updates about our flagship symposium
- Help us build a nationwide student network

**What you'll get:**
- Official Certificate of Recognition
- Exclusive merchandise & swag
- Priority access to sessions and networking

We'd love to schedule a quick call to walk you through the program.

Looking forward to hearing from you.`;

const SPONSORSHIP_STARTER = `Greetings from **IEEE Computer Society – SRMIST**!

We are thrilled to announce **AICSSYC 2026**, our flagship annual symposium bringing together researchers, industry leaders and 1000+ students from across the country.

We would be honoured to have your organisation as a **sponsor** for this year's edition.

**Why partner with us:**
- Nationwide reach across engineering campuses
- Brand visibility across all promotional channels
- Direct access to top student talent
- Speaking & workshop slots for your team

We'd love to set up a call at your convenience to discuss tailored partnership tiers.

Looking forward to a great association.`;

const AMBASSADOR_SIGNOFF = `Warm regards,\n**Team AICSSYC**`;
const SPONSORSHIP_SIGNOFF = `Warm regards,\n**Sponsorship Team, AICSSYC**`;

type BuiltinPreset = {
  key: TemplateType;
  label: string;
  description: string;
  subject: string;
  body: string;
  headerTagline: string;
  eventDates: string;
  signOff: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
};

const BUILTINS: BuiltinPreset[] = [
  {
    key: "ambassador",
    label: "Campus Ambassador",
    description: "Community partners & ambassadors",
    subject: "Invitation to join AICSSYC 2026 as a Campus Ambassador",
    body: AMBASSADOR_STARTER,
    headerTagline: "Join the AICSSYC 2026 Community Network",
    eventDates: "8th – 11th October 2026",
    signOff: AMBASSADOR_SIGNOFF,
  },
  {
    key: "sponsorship",
    label: "Sponsorship",
    description: "Corporate sponsors",
    subject: "Sponsorship Opportunity — AICSSYC 2026 (IEEE CS SRMIST)",
    body: SPONSORSHIP_STARTER,
    headerTagline: "Partner with AICSSYC 2026 — IEEE Computer Society SRMIST",
    eventDates: "8th – 11th October 2026",
    signOff: SPONSORSHIP_SIGNOFF,
  },
];

function customToPreset(t: EmailTemplate): BuiltinPreset {
  return {
    key: t.key,
    label: t.label,
    description: t.description || "Custom template",
    subject: t.subject,
    body: t.body_md,
    headerTagline: t.header_tagline ?? "",
    eventDates: t.event_dates ?? "",
    signOff: t.sign_off ?? "",
    secondaryCtaLabel: t.secondary_cta_label ?? undefined,
    secondaryCtaUrl: t.secondary_cta_url ?? undefined,
  };
}

function Composer() {
  const meFn = useServerFn(getMe);
  const { data: me, refetch } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });

  const listTpl = useServerFn(listEmailTemplates);
  const { data: customTemplates = [] } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => listTpl(),
  });

  const isAdmin = me?.role === "admin";
  const [managerOpen, setManagerOpen] = useState(false);

  const allPresets = useMemo<BuiltinPreset[]>(
    () => [...BUILTINS, ...customTemplates.map(customToPreset)],
    [customTemplates],
  );

  const [templateType, setTemplateType] = useState<TemplateType>("ambassador");
  const [subject, setSubject] = useState(BUILTINS[0].subject);
  const [recipients, setRecipients] = useState("");
  const [defaultDomain, setDefaultDomain] = useState("");

  const [body, setBody] = useState(BUILTINS[0].body);
  const [headerTagline, setHeaderTagline] = useState(BUILTINS[0].headerTagline);
  const [eventDates, setEventDates] = useState(BUILTINS[0].eventDates);
  const [signOff, setSignOff] = useState(BUILTINS[0].signOff);
  const [secondaryCtaLabel, setSecondaryCtaLabel] = useState("");
  const [secondaryCtaUrl, setSecondaryCtaUrl] = useState("");
  const [sending, setSending] = useState(false);

  const send = useServerFn(sendOutreachEmail);

  const parsedRecipients = useMemo(() => {
    const out: Array<{ email: string; name?: string; domain?: string }> = [];
    const fallback = defaultDomain.trim() || undefined;
    for (const raw of recipients.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const angle = line.match(/^(.+?)\s*<\s*([^>\s,;]+@[^>\s,;]+)\s*>$/);
      if (angle) { out.push({ email: angle[2].trim(), name: angle[1].trim(), domain: fallback }); continue; }
      const parts = line.split(/[,;\t]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2 && /@/.test(parts[0])) {
        out.push({ email: parts[0], name: parts[1], domain: parts[2] || fallback });
      } else if (parts.length >= 2 && /@/.test(parts[1])) {
        out.push({ email: parts[1], name: parts[0], domain: parts[2] || fallback });
      } else if (/@/.test(parts[0] ?? "")) {
        out.push({ email: parts[0], domain: fallback });
      }
    }
    return out;
  }, [recipients, defaultDomain]);

  const currentCustomTemplate = useMemo(
    () => customTemplates.find((t) => t.key === templateType),
    [customTemplates, templateType],
  );
  const activeLogoUrls = currentCustomTemplate?.logo_urls ?? [];
  const activeHeaderBg = currentCustomTemplate?.header_bg ?? "";
  const activeHeaderImage = currentCustomTemplate?.header_image_url ?? "";
  const activeFooterImage = currentCustomTemplate?.footer_image_url ?? "";

  const previewRecipient = parsedRecipients[0];
  const previewHtml = useMemo(() => {
    const name = previewRecipient?.name || "";
    const domain = previewRecipient?.domain || defaultDomain.trim();
    const merged = (s: string) =>
      s.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*domain\s*\}\}/gi, domain);
    return buildEmailHtml({
      templateType,
      markdownBody: merged(body),
      recipientName: name || undefined,
      headerTagline: merged(headerTagline),
      eventDates,
      signOff: merged(signOff),
      secondaryCtaLabel: secondaryCtaLabel || undefined,
      secondaryCtaUrl: secondaryCtaUrl || undefined,
      logoUrls: activeLogoUrls.length > 0 ? activeLogoUrls : undefined,
      headerBg: activeHeaderBg || undefined,
      headerImageUrl: activeHeaderImage || undefined,
      footerImageUrl: activeFooterImage || undefined,
    });
  }, [templateType, body, previewRecipient, headerTagline, eventDates, signOff, secondaryCtaLabel, secondaryCtaUrl, activeLogoUrls, activeHeaderBg, activeHeaderImage, activeFooterImage, defaultDomain]);



  const applyPreset = (p: BuiltinPreset) => {
    setTemplateType(p.key);
    setSubject(p.subject);
    setBody(p.body);
    setHeaderTagline(p.headerTagline);
    setEventDates(p.eventDates);
    setSignOff(p.signOff);
    setSecondaryCtaLabel(p.secondaryCtaLabel ?? "");
    setSecondaryCtaUrl(p.secondaryCtaUrl ?? "");
  };

  // If current template was deleted, fall back to first available.
  useEffect(() => {
    if (!allPresets.find((p) => p.key === templateType)) {
      applyPreset(allPresets[0] ?? BUILTINS[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPresets]);

  const handleSend = async () => {
    if (parsedRecipients.length === 0) {
      toast.error("Add at least one recipient email.");
      return;
    }
    setSending(true);
    try {
      const res = await send({
        data: {
          templateType,
          markdownBody: body,
          recipients: parsedRecipients,
          subject,
          headerTagline: headerTagline || undefined,
          eventDates: eventDates || undefined,
          signOff: signOff || undefined,
          secondaryCtaLabel: secondaryCtaLabel || undefined,
          secondaryCtaUrl: secondaryCtaUrl || undefined,
          logoUrls: activeLogoUrls.length > 0 ? activeLogoUrls : undefined,
          headerBg: activeHeaderBg || undefined,
          headerImageUrl: activeHeaderImage || undefined,
          footerImageUrl: activeFooterImage || undefined,

        },
      });

      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`Sent ${res.sent} email(s) via shared account (${res.senderEmail})`);
      } else {
        toast.error(`Sent ${res.sent}/${res.total}. ${failed.length} failed.`);
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const copyHtml = async () => {
    await navigator.clipboard.writeText(previewHtml);
    toast.success("HTML copied to clipboard");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader me={me ?? null} onRefresh={refetch} />

      {me && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
          <div className="mx-auto max-w-7xl px-6 py-2 flex items-center justify-between">
            <span>Emails are sent from the shared IEEE CS SRMIST account.</span>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700">Template</label>
              {isAdmin && (
                <button
                  onClick={() => setManagerOpen(true)}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Manage templates
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {allPresets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                    templateType === p.key ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="line-clamp-2 text-xs text-slate-500">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Recipients</label>
              <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={6}
                placeholder={`alice@company.com, Alice Sharma, Technical\nbob@company.com, Bob Kumar, Design\ncarol@company.com`}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none" />
              <p className="mt-1 text-xs text-slate-500">
                One per line. Format: <code>email, Name, Domain</code> or <code>Name &lt;email&gt;</code> or just <code>email</code>.
                Use <code>{"{{name}}"}</code> and <code>{"{{domain}}"}</code> in subject, header tagline, body or sign-off.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Default domain <span className="font-normal text-slate-400">(used when a line has no domain column)</span>
              </label>
              <input type="text" value={defaultDomain} onChange={(e) => setDefaultDomain(e.target.value)}
                placeholder="e.g. Technical / Design / Corporate"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
            </div>


            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Header tagline</label>
                <input type="text" value={headerTagline} onChange={(e) => setHeaderTagline(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Event dates</label>
                <input type="text" value={eventDates} onChange={(e) => setEventDates(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
              </div>
            </div>

            {!BUILTINS.some((b) => b.key === templateType) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Secondary CTA label</label>
                  <input type="text" value={secondaryCtaLabel} onChange={(e) => setSecondaryCtaLabel(e.target.value)}
                    placeholder="e.g. Brochure"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Secondary CTA URL</label>
                  <input type="url" value={secondaryCtaUrl} onChange={(e) => setSecondaryCtaUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Email body <span className="font-normal text-slate-400">(Markdown)</span>
              </label>
              <RichMarkdownEditor value={body} onChange={setBody} height={360} preview="edit" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Ending salutation</label>
              <RichMarkdownEditor value={signOff} onChange={setSignOff} height={140} preview="edit" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleSend} disabled={sending}
              className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60">
              {sending ? "Sending…" : `Send email${parsedRecipients.length > 1 ? "s" : ""}`}
            </button>
            <button onClick={copyHtml}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Copy HTML
            </button>
            {parsedRecipients.length > 0 && <span className="text-xs text-slate-500">{parsedRecipients.length} recipient(s)</span>}
          </div>
        </section>

        <section className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Live preview</h2>
            <span className="text-xs text-slate-400">Rendered as recipients will see it</span>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="h-[820px] w-full border-0" />
          </div>
        </section>
      </main>

      {isAdmin && (
        <TemplateManagerModal
          open={managerOpen}
          onClose={() => setManagerOpen(false)}
          templates={customTemplates}
        />
      )}
    </div>
  );
}
