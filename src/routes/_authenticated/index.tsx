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
      { title: "Composer — SponsorConnect" },
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="sc-label">{children}</label>
  );
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
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");

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
    <div className="min-h-screen" style={{ background: "oklch(0.1 0.025 255)" }}>
      <AppHeader me={me ?? null} onRefresh={refetch} />

      {/* Main content — offset for sidebar */}
      <div className="lg:pl-[220px] pt-14 lg:pt-0">
        {/* Top bar */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
          <div>
            <h1 className="font-bold text-lg" style={{ color: "oklch(0.92 0.005 255)" }}>Email Composer</h1>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.02 255)" }}>
              Shared IEEE CS SRMIST sender account
            </p>
          </div>

          {/* Mobile tab switcher */}
          <div className="flex lg:hidden p-1 rounded-lg gap-1" style={{ background: "oklch(0.16 0.03 255)" }}>
            {(["compose", "preview"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize"
                style={activeTab === tab
                  ? { background: "oklch(0.62 0.24 280)", color: "white" }
                  : { color: "oklch(0.5 0.02 255)" }
                }>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <main className="grid lg:grid-cols-2 h-[calc(100vh-65px)] lg:h-[calc(100vh-57px)] overflow-hidden">
          {/* ── Left: Compose panel ── */}
          <div className={`overflow-y-auto p-5 space-y-4 ${activeTab === "preview" ? "hidden lg:block" : "block"}`}
            style={{ borderRight: "1px solid oklch(0.22 0.04 255)" }}>

            {/* Template selector */}
            <div className="sc-card">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Template</SectionLabel>
                {isAdmin && (
                  <button
                    onClick={() => setManagerOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: "oklch(0.62 0.24 280 / 15%)",
                      color: "oklch(0.78 0.18 280)",
                      border: "1px solid oklch(0.62 0.24 280 / 30%)"
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Manage
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allPresets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p)}
                    className={`rounded-xl p-3 text-left text-sm transition-all border ${
                      templateType === p.key ? "template-card-active" : ""
                    }`}
                    style={templateType !== p.key ? {
                      background: "oklch(0.13 0.025 255)",
                      border: "1px solid oklch(0.25 0.04 255 / 50%)",
                      color: "oklch(0.75 0.01 255)"
                    } : {}}
                  >
                    <div className="font-semibold text-xs" style={templateType === p.key ? { color: "oklch(0.82 0.14 280)" } : {}}>
                      {p.label}
                    </div>
                    <div className="line-clamp-2 text-[11px] mt-0.5" style={{ color: "oklch(0.45 0.02 255)" }}>
                      {p.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recipients */}
            <div className="sc-card space-y-4">
              <div>
                <SectionLabel>Recipients</SectionLabel>
                <textarea
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  rows={5}
                  placeholder={`alice@company.com, Alice Sharma, Technical\nbob@company.com, Bob Kumar, Design\ncarol@company.com`}
                  className="sc-input font-mono"
                  style={{ resize: "vertical" }}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: "oklch(0.42 0.02 255)" }}>
                  One per line. Format: <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "oklch(0.2 0.04 255)", color: "oklch(0.68 0.22 275)" }}>email, Name, Domain</code> or <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "oklch(0.2 0.04 255)", color: "oklch(0.68 0.22 275)" }}>Name &lt;email&gt;</code>.{" "}
                  Use <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "oklch(0.2 0.04 255)", color: "oklch(0.68 0.22 275)" }}>{"{{name}}"}</code> and <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "oklch(0.2 0.04 255)", color: "oklch(0.68 0.22 275)" }}>{"{{domain}}"}</code> for personalisation.
                </p>
              </div>

              <div>
                <SectionLabel>
                  Default domain <span style={{ color: "oklch(0.38 0.02 255)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(when not in recipient line)</span>
                </SectionLabel>
                <input
                  type="text"
                  value={defaultDomain}
                  onChange={(e) => setDefaultDomain(e.target.value)}
                  placeholder="e.g. Technical / Design / Corporate"
                  className="sc-input"
                />
              </div>
            </div>

            {/* Email fields */}
            <div className="sc-card space-y-4">
              <div>
                <SectionLabel>Subject line</SectionLabel>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="sc-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel>Header tagline</SectionLabel>
                  <input
                    type="text"
                    value={headerTagline}
                    onChange={(e) => setHeaderTagline(e.target.value)}
                    className="sc-input"
                  />
                </div>
                <div>
                  <SectionLabel>Event dates</SectionLabel>
                  <input
                    type="text"
                    value={eventDates}
                    onChange={(e) => setEventDates(e.target.value)}
                    className="sc-input"
                  />
                </div>
              </div>

              {!BUILTINS.some((b) => b.key === templateType) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <SectionLabel>Secondary CTA label</SectionLabel>
                    <input type="text" value={secondaryCtaLabel} onChange={(e) => setSecondaryCtaLabel(e.target.value)}
                      placeholder="e.g. Brochure" className="sc-input" />
                  </div>
                  <div>
                    <SectionLabel>Secondary CTA URL</SectionLabel>
                    <input type="url" value={secondaryCtaUrl} onChange={(e) => setSecondaryCtaUrl(e.target.value)}
                      placeholder="https://..." className="sc-input" />
                  </div>
                </div>
              )}

              <div>
                <SectionLabel>Email body <span style={{ color: "oklch(0.38 0.02 255)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(Markdown)</span></SectionLabel>
                <RichMarkdownEditor value={body} onChange={setBody} height={320} preview="edit" />
              </div>

              <div>
                <SectionLabel>Sign-off</SectionLabel>
                <RichMarkdownEditor value={signOff} onChange={setSignOff} height={120} preview="edit" />
              </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-3 pb-4">
              <button
                onClick={handleSend}
                disabled={sending}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Sending…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
                    </svg>
                    Send email{parsedRecipients.length > 1 ? "s" : ""}
                  </>
                )}
              </button>

              <button onClick={copyHtml} className="btn-ghost text-sm flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                Copy HTML
              </button>

              {parsedRecipients.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.65 0.16 160)" }} />
                  <span className="text-xs font-medium" style={{ color: "oklch(0.55 0.02 255)" }}>
                    {parsedRecipients.length} recipient{parsedRecipients.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Preview panel ── */}
          <div className={`flex flex-col ${activeTab === "compose" ? "hidden lg:flex" : "flex"}`}>
            <div className="px-5 py-3 flex items-center justify-between shrink-0"
              style={{ borderBottom: "1px solid oklch(0.22 0.04 255)" }}>
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "oklch(0.45 0.02 255)" }}>
                Live Preview
              </h2>
              <span className="text-[11px]" style={{ color: "oklch(0.35 0.02 255)" }}>
                Rendered as recipients will see it
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </main>
      </div>

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
