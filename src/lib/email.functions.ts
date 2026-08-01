import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildEmailHtml } from "./email-template";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyFailure, type EmailFailureStatus } from "./bounce-classifier";

export type { MailAttachment } from "./email-transport.server";

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  domain: z.string().max(120).optional(),
});

const inputSchema = z.object({
  templateType: z.string().min(1).max(64),
  subject: z.string().min(1),
  markdownBody: z.string(),
  recipients: z.array(recipientSchema).min(1),
  headerTagline: z.string().optional(),
  eventDates: z.string().optional(),
  signOff: z.string().optional(),
  secondaryCtaLabel: z.string().optional(),
  secondaryCtaUrl: z.string().url().optional().or(z.literal("")),
  logoUrls: z.array(z.string().url()).max(6).optional(),
  headerBg: z.string().max(200).optional(),
  headerImageUrl: z.string().url().optional().or(z.literal("")),
  footerImageUrl: z.string().url().optional().or(z.literal("")),
});



export type SendEmailInput = z.infer<typeof inputSchema>;
export type SendEmailResult = {
  sent: number;
  total: number;
  transport: "smtp_gmail";
  senderEmail: string;
  results: Array<{ to: string; ok: boolean; status: string; error?: string; messageId?: string }>;
};

export const sendOutreachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<SendEmailResult> => {
    const { supabase, userId } = context;

    const [profRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("email,is_active").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (!profRes.data?.is_active) throw new Error("Your account is disabled. Contact an admin.");

    const roles = (rolesRes.data ?? []).map((r: any) => r.role as string);
    const role = roles.includes("admin") ? "admin" : "volunteer";
    void role;
    // Daily send cap removed — no per-user limit.

    const transport = "smtp_gmail" as const;
    const senderEmail = process.env.GMAIL_USER;
    if (!senderEmail) throw new Error("Shared Gmail sender is not configured.");

    const applyMerge = (text: string, name: string, domain: string) =>
      text.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*domain\s*\}\}/gi, domain);

    const results: SendEmailResult["results"] = [];
    let mailer: Awaited<ReturnType<typeof import("./email-transport.server")["createMailer"]>> | null = null;
    let mailerErr: string | null = null;
    try {
      const { createMailer } = await import("./email-transport.server");
      mailer = await createMailer();
    } catch (e: any) {
      mailerErr = e?.message || "Email transport unavailable.";
    }

    for (const r of data.recipients) {
      const name = (r.name || "").trim();
      const domain = (r.domain || "").trim();
      const personalizedSubject = applyMerge(data.subject, name, domain);
      const personalizedBody = applyMerge(data.markdownBody, name, domain);
      const personalizedSignOff = data.signOff ? applyMerge(data.signOff, name, domain) : data.signOff;
      const html = buildEmailHtml({
        templateType: data.templateType,
        markdownBody: personalizedBody,
        recipientName: name || undefined,
        headerTagline: data.headerTagline ? applyMerge(data.headerTagline, name, domain) : data.headerTagline,
        eventDates: data.eventDates,
        signOff: personalizedSignOff,
        secondaryCtaLabel: data.secondaryCtaLabel,
        secondaryCtaUrl: data.secondaryCtaUrl || undefined,
        logoUrls: data.logoUrls,
        headerBg: data.headerBg,
        headerImageUrl: data.headerImageUrl || undefined,
        footerImageUrl: data.footerImageUrl || undefined,
      });


      const appDomain = process.env.VERCEL_URL || process.env.APP_URL?.replace(/^https?:\/\//, '') || "localhost";
      const messageIdBare = `${crypto.randomUUID()}@${appDomain}`;
      const messageIdHeader = `<${messageIdBare}>`;

      // Insert as QUEUED first so we always have a row even on total transport failure
      const { data: row, error: insErr } = await supabase
        .from("email_messages")
        .insert({
          user_id: userId,
          sender_email: senderEmail,
          recipient_name: name || null,
          recipient_email: r.email,
          subject: personalizedSubject,
          body: personalizedBody,
          template_type: data.templateType,
          gmail_message_id: messageIdBare,
          status: "QUEUED" as const,
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        console.error("[email] insert failed:", insErr);
        results.push({ to: r.email, ok: false, status: "FAILED", error: insErr.message });
        continue;
      }
      const rowId = row!.id;

      if (mailerErr || !mailer) {
        await supabase.from("email_messages").update({
          status: "FAILED" as const,
          failure_reason: mailerErr ?? "Mailer unavailable",
        }).eq("id", rowId);
        results.push({ to: r.email, ok: false, status: "FAILED", error: mailerErr ?? "Mailer unavailable" });
        continue;
      }

      await supabase.from("email_messages").update({ status: "SENDING" as const }).eq("id", rowId);

      try {
        const { smtpResponse } = await mailer.send({
          from: senderEmail,
          to: r.email,
          subject: personalizedSubject,
          html,
          messageId: messageIdHeader,
        });
        await supabase.from("email_messages").update({
          status: "SENT" as const,
          smtp_response: smtpResponse,
        }).eq("id", rowId);
        results.push({ to: r.email, ok: true, status: "SENT", messageId: messageIdBare });
      } catch (e: any) {
        const raw = e?.message ?? "Send failed";
        const classified = classifyFailure(raw);
        const status: EmailFailureStatus = classified.status;
        await supabase.from("email_messages").update({
          status,
          failure_reason: classified.reason,
          smtp_response: raw,
        }).eq("id", rowId);
        console.error(`[email] send to ${r.email} failed:`, raw);
        results.push({ to: r.email, ok: false, status, error: classified.reason });
      }
    }

    await mailer?.close().catch(() => {});

    return {
      sent: results.filter((r) => r.ok).length,
      total: results.length,
      transport,
      senderEmail,
      results,
    };
  });
