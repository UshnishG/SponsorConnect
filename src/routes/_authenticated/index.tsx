import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { sendOutreachEmail } from "@/lib/email.functions";
import { getMe } from "@/lib/auth.functions";
import { listEmailTemplates, deleteEmailTemplate, type EmailTemplate } from "@/lib/templates.functions";
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

const LEAD_INTERVIEWS_STARTER = `Greetings from **IEEE Computer Society – SRMIST**!

We are thrilled to announce **AICSSYC 2026**, our flagship annual symposium bringing together researchers, industry leaders and 1000+ students from across the country.

We have closely followed your remarkable work in the industry, and we would be absolutely honoured to host you as a **Guest Speaker** for this year's edition.

**What to expect:**
- An audience of 1000+ passionate engineering students
- A platform to share your journey, insights, and technical expertise
- High-profile networking with fellow industry leaders and academics

We'd love to set up a quick call at your earliest convenience to discuss a potential session topic and walk you through the event details.

Looking forward to the possibility of hosting you.`;

const LEAD_INTERVIEWS_SIGNOFF = `Warm regards,\n**Team AICSSYC**`;

type CtaButton = { label: string; url: string; style?: 'filled' | 'outline' };
type SocialLink = { platform: string; url: string };

type TemplatePreset = {
  key: TemplateType;
  label: string;
  description: string;
  subject: string;
  body: string;
  headerTagline?: string;
  eventDates?: string;
  signOff?: string;
  ctaButtons?: CtaButton[];
  socialLinks?: SocialLink[];
  logoUrls?: string[];
  headerBg?: string;
  headerImageUrl?: string;
  footerImageUrl?: string;
};

function templateToPreset(t: EmailTemplate): TemplatePreset {
  return {
    key: t.key,
    label: t.label,
    description: t.description || "Custom template",
    subject: t.subject,
    body: t.body_md,
    headerTagline: t.header_tagline ?? "",
    eventDates: t.event_dates ?? "",
    signOff: t.sign_off ?? "",
    ctaButtons: (t as any).cta_buttons ?? [],
    socialLinks: (t as any).social_links ?? [],
    logoUrls: (t as any).logo_urls ?? [],
    headerBg: (t as any).header_bg ?? undefined,
    headerImageUrl: (t as any).header_image_url ?? undefined,
    footerImageUrl: (t as any).footer_image_url ?? undefined,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="sc-label">{label}</label>
      {children}
    </div>
  );
}

function Composer() {
  const meFn = useServerFn(getMe);
  const { data: me, refetch } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });

  const listTpl = useServerFn(listEmailTemplates);
  const { data: customTemplates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => listTpl(),
  });

  const isAdmin = me?.role === "admin";
  const [managerOpen, setManagerOpen] = useState(false);

  const allPresets = useMemo<TemplatePreset[]>(
    () => customTemplates.map(templateToPreset),
    [customTemplates],
  );

  const [templateType, setTemplateType] = useState<TemplateType>(allPresets[0]?.key || ("" as any));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [recipients, setRecipients] = useState("");
  const [defaultDomain, setDefaultDomain] = useState("");
  const [body, setBody] = useState("");
  const [headerTagline, setHeaderTagline] = useState("");
  const [eventDates, setEventDates] = useState("");
  const [signOff, setSignOff] = useState("");
  const [ctaButtons, setCtaButtons] = useState<CtaButton[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [showAicssycLogo, setShowAicssycLogo] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");

  const send = useServerFn(sendOutreachEmail);
  const delTemplate = useServerFn(deleteEmailTemplate);

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

  const currentTemplate = useMemo(
    () => allPresets.find((t) => t.key === templateType),
    [allPresets, templateType],
  );

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
      ctaButtons: ctaButtons?.length > 0 ? ctaButtons : undefined,
      socialLinks: socialLinks?.length > 0 ? socialLinks : undefined,
      logoUrls: currentTemplate?.logoUrls ?? [],
      headerBg: currentTemplate?.headerBg,
      headerImageUrl: currentTemplate?.headerImageUrl,
      footerImageUrl: currentTemplate?.footerImageUrl,
      showAicssycLogo,
    });
  }, [templateType, body, previewRecipient, headerTagline, eventDates, signOff, ctaButtons, socialLinks, currentTemplate, defaultDomain, showAicssycLogo]);

  const applyPreset = (p: TemplatePreset) => {
    setTemplateType(p.key);
    setSubject(p.subject);
    setBody(p.body);
    setHeaderTagline(p.headerTagline ?? "");
    setEventDates(p.eventDates ?? "");
    setSignOff(p.signOff ?? "");
    setCtaButtons(p.ctaButtons ?? []);
    setSocialLinks(p.socialLinks ?? []);
  };

  useEffect(() => {
    if (allPresets.length > 0 && !allPresets.find((p) => p.key === templateType)) {
      applyPreset(allPresets[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPresets]);

  const handleSend = async () => {
    if (parsedRecipients.length === 0) { toast.error("Add at least one recipient email."); return; }
    setSending(true);
    try {
      const res = await send({
        data: {
          templateType, markdownBody: body, recipients: parsedRecipients, subject,
          headerTagline: headerTagline || undefined, eventDates: eventDates || undefined,
          signOff: signOff || undefined,
          ctaButtons: ctaButtons?.length > 0 ? ctaButtons : undefined,
          socialLinks: socialLinks?.length > 0 ? socialLinks : undefined,
          logoUrls: currentTemplate?.logoUrls ?? [],
          headerBg: currentTemplate?.headerBg, headerImageUrl: currentTemplate?.headerImageUrl,
          footerImageUrl: currentTemplate?.footerImageUrl,
          showAicssycLogo,
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

  const handleDeleteCustom = async () => {
    if (!currentTemplate) return;
    if (!confirm(`Are you sure you want to delete the custom template "${currentTemplate.label}"?`)) return;
    try {
      const templateId = customTemplates.find(t => t.key === currentTemplate.key)?.id;
      if (!templateId) return;
      await delTemplate({ data: { id: templateId } });
      toast.success("Template deleted");
      await refetchTemplates();
      setTemplateType(allPresets.find(p => p.key !== currentTemplate.key)?.key || ("" as any));
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  const INK = "#0e0d0b";
  const PAPER = "#f5f0e8";
  const CREAM = "#fdf8ef";
  const RUST = "#c0392b";

  return (
    <div style={{ minHeight: "100vh", background: CREAM }}>
      <AppHeader me={me ?? null} onRefresh={refetch} />

      <div className="lg:pl-[220px] pt-14 lg:pt-0" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.875rem 1.5rem", borderBottom: `3px solid ${INK}`,
          background: PAPER, flexShrink: 0,
        }}>
          <div>
            <div className="font-brutalist text-2xl tracking-widest" style={{ color: INK, lineHeight: 1 }}>
              COMPOSE
            </div>
            <div className="font-mono text-[10px]" style={{ color: "#8a8070", letterSpacing: "0.1em" }}>
              SHARED IEEE CS SRMIST SENDER
            </div>
          </div>

          <div className="flex lg:hidden" style={{ border: `2.5px solid ${INK}` }}>
            {(["compose", "preview"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="font-brutalist"
                style={{
                  padding: "0.35rem 0.75rem", fontSize: "0.8rem", letterSpacing: "0.1em",
                  border: "none", cursor: "pointer",
                  background: activeTab === tab ? INK : PAPER,
                  color: activeTab === tab ? CREAM : "#6b6050",
                  borderRight: tab === "compose" ? `2.5px solid ${INK}` : "none",
                }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          className="flex flex-col lg:flex-row">

          <div
            className={`flex-col ${activeTab === "preview" ? "hidden lg:flex" : "flex"} lg:w-[450px] xl:w-[500px] flex-shrink-0`}
            style={{ overflowY: "auto", padding: "1.25rem", gap: "1rem", borderRight: `3px solid ${INK}` }}
          >

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="font-brutalist"
                  style={{
                    width: "100%", height: "100%",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.6rem 1rem",
                    background: INK, color: CREAM,
                    border: `3px solid ${INK}`,
                    fontSize: "0.8rem", letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ✦ {templateType ? (allPresets.find(p => p.key === templateType)?.label.toUpperCase() || "SELECT TEMPLATE") : "NO TEMPLATES FOUND"}
                  </span>
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.6rem", opacity: 0.6 }}>{dropdownOpen ? "▲" : "▼"}</span>
                </button>

                {dropdownOpen && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div
                      style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                        zIndex: 50,
                        background: CREAM,
                        border: `3px solid ${INK}`,
                        boxShadow: `5px 5px 0 ${INK}`,
                        maxHeight: "260px", overflowY: "auto",
                      }}
                    >
                      {allPresets.map((p, idx) => (
                        <button
                          key={p.key}
                          onClick={() => { applyPreset(p); setDropdownOpen(false); }}
                          className="font-brutalist"
                          style={{
                            width: "100%", textAlign: "left",
                            padding: "0.65rem 1rem",
                            background: p.key === templateType ? PAPER : "transparent",
                            borderBottom: idx < allPresets.length - 1 ? `2px solid ${INK}` : "none",
                            cursor: "pointer", border: "none",
                            borderBottomStyle: idx < allPresets.length - 1 ? "solid" : "none",
                            borderBottomWidth: idx < allPresets.length - 1 ? "2px" : "0",
                            borderBottomColor: INK,
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", letterSpacing: "0.08em", color: INK }}>
                            {p.key === templateType ? "● " : "○ "}{p.label.toUpperCase()}
                          </div>
                          <div className="font-mono" style={{ fontSize: "0.6rem", color: "#8a8070", marginTop: "2px" }}>
                            {p.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {isAdmin && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleDeleteCustom}
                    disabled={!currentTemplate}
                    title="Delete this template"
                    className="font-brutalist"
                    style={{
                      padding: "0.6rem",
                      background: currentTemplate ? "#fee2e2" : "#f1f5f9", 
                      color: currentTemplate ? "#dc2626" : "#94a3b8",
                      border: `3px solid ${INK}`,
                      cursor: currentTemplate ? "pointer" : "not-allowed",
                      flexShrink: 0,
                    }}
                  >
                    🗑
                  </button>
                  <button
                    onClick={() => setManagerOpen(true)}
                    className="font-brutalist"
                    style={{
                      padding: "0.6rem 1.25rem",
                      background: RUST, color: CREAM,
                      border: `3px solid ${INK}`,
                      fontSize: "0.75rem", letterSpacing: "0.08em",
                      cursor: "pointer", whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    ⚙ MANAGE
                  </button>
                </div>
              )}
            </div>

            {/* ── Recipients ── */}
            <div className="sc-card" style={{ padding: 0, overflow: "hidden", flexShrink: 0 }}>
              <div className="sc-card-header">RECIPIENTS</div>
              <div style={{ padding: "0.875rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div>
                  <textarea
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    rows={5}
                    placeholder={`alice@corp.com, Alice Sharma, Technical\nbob@corp.com, Bob Kumar\ncarol@corp.com`}
                    className="sc-input"
                  />
                  <p className="font-mono text-[10px] mt-1.5 leading-relaxed" style={{ color: "#9a9080" }}>
                    One per line — <code style={{ color: "#c0392b" }}>email, Name, Domain</code> or <code style={{ color: "#c0392b" }}>Name &lt;email&gt;</code>.
                    Use <code style={{ color: "#c0392b" }}>{"{{name}}"}</code> and <code style={{ color: "#c0392b" }}>{"{{domain}}"}</code> for merge.
                  </p>
                </div>
                <Field label="Default domain">
                  <input type="text" value={defaultDomain} onChange={(e) => setDefaultDomain(e.target.value)}
                    placeholder="e.g. Technical / Corporate" className="sc-input" />
                </Field>
              </div>
            </div>

            {/* ── Email fields ── */}
            <div className="sc-card" style={{ padding: 0, overflow: "hidden", flexShrink: 0 }}>
              <div className="sc-card-header">EMAIL CONTENT</div>
              <div style={{ padding: "0.875rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <Field label="Subject line">
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="sc-input" />
                </Field>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  <Field label="Header tagline">
                    <input type="text" value={headerTagline} onChange={(e) => setHeaderTagline(e.target.value)} className="sc-input" />
                  </Field>
                  <Field label="Event dates">
                    <input type="text" value={eventDates} onChange={(e) => setEventDates(e.target.value)} className="sc-input" />
                  </Field>
                </div>

                {/* ── CTA Buttons Editor ── */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <label className="sc-label" style={{ margin: 0 }}>CTA BUTTONS</label>
                    <button
                      type="button"
                      onClick={() => setCtaButtons([...ctaButtons, { label: "", url: "", style: "filled" }])}
                      className="font-brutalist"
                      style={{
                        padding: "0.25rem 0.6rem", fontSize: "0.65rem",
                        background: INK, color: CREAM, border: `2px solid ${INK}`,
                        cursor: "pointer", letterSpacing: "0.05em",
                      }}
                    >
                      + ADD BUTTON
                    </button>
                  </div>
                  {(!ctaButtons || ctaButtons.length === 0) && (
                    <div className="font-mono" style={{ fontSize: "0.7rem", color: "#9a9080", padding: "0.5rem", border: "2px dashed #ccc" }}>
                      No buttons. Click "+ ADD BUTTON" to add one.
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {(ctaButtons || []).map((btn, i) => (
                      <div key={i} style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: "0.4rem", alignItems: "center",
                        padding: "0.5rem", border: `2px solid ${INK}`, background: PAPER,
                      }}>
                        <input
                          type="text" value={btn.label} placeholder="Button label"
                          onChange={(e) => { const n = [...ctaButtons]; n[i] = { ...n[i], label: e.target.value }; setCtaButtons(n); }}
                          className="sc-input" style={{ fontSize: "0.8rem" }}
                        />
                        <input
                          type="url" value={btn.url} placeholder="https://..."
                          onChange={(e) => { const n = [...ctaButtons]; n[i] = { ...n[i], url: e.target.value }; setCtaButtons(n); }}
                          className="sc-input" style={{ fontSize: "0.8rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => { const n = [...ctaButtons]; n[i] = { ...n[i], style: n[i].style === 'outline' ? 'filled' : 'outline' }; setCtaButtons(n); }}
                          className="font-mono"
                          style={{
                            padding: "0.3rem 0.5rem", fontSize: "0.6rem", cursor: "pointer",
                            border: `2px solid ${INK}`,
                            background: btn.style === 'outline' ? '#fff' : INK,
                            color: btn.style === 'outline' ? INK : CREAM,
                          }}
                          title="Toggle filled/outline style"
                        >
                          {btn.style === 'outline' ? 'OUTLINE' : 'FILLED'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCtaButtons(ctaButtons.filter((_, j) => j !== i))}
                          style={{
                            padding: "0.3rem 0.5rem", fontSize: "0.7rem",
                            background: RUST, color: CREAM, border: "none", cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Social Links ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label className="sc-label" style={{ margin: 0 }}>SOCIAL LINKS (BODY)</label>
                    <button
                      type="button"
                      onClick={() => setSocialLinks([...socialLinks, { platform: 'LinkedIn', url: '' }])}
                      className="font-brutalist"
                      style={{
                        padding: "0.25rem 0.6rem", fontSize: "0.65rem",
                        background: INK, color: CREAM, border: `2px solid ${INK}`,
                        cursor: "pointer", letterSpacing: "0.05em",
                      }}
                    >
                      + ADD SOCIAL
                    </button>
                  </div>
                  {(!socialLinks || socialLinks.length === 0) && (
                    <div className="font-mono" style={{ fontSize: "0.7rem", color: "#9a9080", padding: "0.5rem", border: "2px dashed #ccc" }}>
                      No social links in body. Click "+ ADD SOCIAL" to add one.
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {(socialLinks || []).map((link, i) => (
                      <div key={i} style={{
                        display: "grid", gridTemplateColumns: "100px 1fr auto", gap: "0.4rem", alignItems: "center",
                        padding: "0.5rem", border: `2px solid ${INK}`, background: PAPER,
                      }}>
                        <select
                          value={link.platform}
                          onChange={(e) => { const n = [...socialLinks]; n[i] = { ...n[i], platform: e.target.value }; setSocialLinks(n); }}
                          className="sc-input font-mono" style={{ fontSize: "0.8rem", padding: "0.4rem" }}
                        >
                          <option value="LinkedIn">LinkedIn</option>
                          <option value="Instagram">Instagram</option>
                          <option value="X">X (Twitter)</option>
                          <option value="YouTube">YouTube</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Website">Website</option>
                        </select>
                        <input
                          type="url" value={link.url} placeholder="https://..."
                          onChange={(e) => { const n = [...socialLinks]; n[i] = { ...n[i], url: e.target.value }; setSocialLinks(n); }}
                          className="sc-input" style={{ fontSize: "0.8rem" }}
                        />
                        <button
                          type="button"
                          onClick={() => setSocialLinks(socialLinks.filter((_, j) => j !== i))}
                          style={{
                            padding: "0.3rem 0.5rem", fontSize: "0.7rem",
                            background: RUST, color: CREAM, border: "none", cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <Field label="Email body (Markdown)">
                  <RichMarkdownEditor value={body} onChange={setBody} height={300} preview="edit" />
                </Field>

                <Field label="Sign-off">
                  <RichMarkdownEditor value={signOff} onChange={setSignOff} height={110} preview="edit" />
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "0.85rem", fontWeight: 600 }}>
                    <input type="checkbox" checked={showAicssycLogo} onChange={(e) => setShowAicssycLogo(e.target.checked)} />
                    Include AICSSYC Logo Below Sign-off
                  </label>
                </Field>
              </div>
            </div>

            {/* ── Actions ── */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", paddingBottom: "1.5rem" }}>
              <button onClick={handleSend} disabled={sending} className="btn-stamp" style={{ fontSize: "0.9rem" }}>
                {sending ? (
                  <><svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> SENDING…</>
                ) : (
                  <>▶ SEND EMAIL{parsedRecipients.length > 1 ? "S" : ""}</>
                )}
              </button>

              <button onClick={copyHtml} className="btn-stamp-ghost" style={{ fontSize: "0.8rem" }}>
                ⊕ COPY HTML
              </button>

              {parsedRecipients.length > 0 && (
                <div style={{
                  marginLeft: "auto",
                  background: INK, color: CREAM,
                  padding: "0.25rem 0.75rem",
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "0.85rem", letterSpacing: "0.1em",
                  border: `2px solid ${INK}`,
                  boxShadow: `2px 2px 0 ${RUST}`,
                }}>
                  {parsedRecipients.length} RECIPIENT{parsedRecipients.length !== 1 ? "S" : ""}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Preview */}
          <div
            className={`flex-col flex-1 min-w-0 ${activeTab === "compose" ? "hidden lg:flex" : "flex"}`}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.6rem 1rem", background: INK, borderBottom: `2px solid #2a2520`, flexShrink: 0,
            }}>
              <span className="font-brutalist text-sm tracking-widest" style={{ color: "#a09888" }}>
                LIVE PREVIEW
              </span>
              <span className="font-mono text-[10px]" style={{ color: "#5a5248" }}>
                Rendered as recipients see it
              </span>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <iframe title="Email preview" srcDoc={previewHtml} sandbox="" style={{ width: "100%", height: "100%", border: "none" }} />
            </div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <TemplateManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} templates={customTemplates} />
      )}
    </div>
  );
}
