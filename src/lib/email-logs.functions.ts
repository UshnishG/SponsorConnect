import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EmailStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED_TO_SERVER"
  | "FAILED"
  | "INVALID_EMAIL"
  | "MAILBOX_NOT_FOUND"
  | "DOMAIN_NOT_FOUND"
  | "MAILBOX_FULL"
  | "BLOCKED"
  | "TEMPORARY_FAILURE";

export type EmailMessage = {
  id: string;
  user_id: string;
  sender_email: string;
  recipient_name: string | null;
  recipient_email: string;
  subject: string;
  body: string;
  template_type: string | null;
  gmail_message_id: string | null;
  status: EmailStatus;
  failure_reason: string | null;
  smtp_response: string | null;
  processed: boolean;
  bounce_checked_at: string | null;
  created_at: string;
  updated_at: string;
  sent_by_name: string | null;
  sent_by_email: string | null;
};


const listSchema = z.object({
  status: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  failureType: z.string().optional(),
  from: z.string().optional(), // ISO date
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type ListEmailsInput = z.infer<typeof listSchema>;

export const listMyEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<EmailMessage[]> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });

    let q = supabase
      .from("email_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (!isAdmin) q = q.eq("user_id", userId);
    if (data.status) q = q.eq("status", data.status as EmailStatus);
    if (data.recipient) q = q.ilike("recipient_email", `%${data.recipient}%`);
    if (data.subject) q = q.ilike("subject", `%${data.subject}%`);
    if (data.failureType) q = q.eq("status", data.failureType as EmailStatus);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as EmailMessage[];

    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    let profileMap = new Map<string, { name: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,name,email")
        .in("id", userIds);
      for (const p of profs ?? []) {
        profileMap.set(p.id as string, { name: (p as any).name ?? null, email: (p as any).email ?? null });
      }
    }
    return list.map((r) => ({
      ...r,
      sent_by_name: profileMap.get(r.user_id)?.name ?? null,
      sent_by_email: profileMap.get(r.user_id)?.email ?? null,
    }));
  });


export const getEmailById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EmailMessage | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("email_messages")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as EmailMessage | null) ?? null;
  });

export type EmailStatsSummary = {
  total: number;
  successful: number;
  pending: number;
  failed: number;
  invalidEmail: number;
  mailboxNotFound: number;
  domainNotFound: number;
  mailboxFull: number;
  blocked: number;
  temporaryFailure: number;
  successRate: number;
  failureRate: number;
  today: number;
  thisMonth: number;
};

export const getMyEmailStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailStatsSummary> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });

    let q = supabase.from("email_messages").select("status,created_at").limit(5000);
    if (!isAdmin) q = q.eq("user_id", userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ status: EmailStatus; created_at: string }>;

    const count = (s: EmailStatus) => list.filter((r) => r.status === s).length;
    const successful = count("SENT") + count("DELIVERED_TO_SERVER");
    const pending = count("QUEUED") + count("SENDING");
    const failed =
      count("FAILED") +
      count("INVALID_EMAIL") +
      count("MAILBOX_NOT_FOUND") +
      count("DOMAIN_NOT_FOUND") +
      count("MAILBOX_FULL") +
      count("BLOCKED") +
      count("TEMPORARY_FAILURE");
    const total = list.length;

    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1); startOfMonth.setUTCHours(0, 0, 0, 0);

    return {
      total,
      successful,
      pending,
      failed,
      invalidEmail: count("INVALID_EMAIL"),
      mailboxNotFound: count("MAILBOX_NOT_FOUND"),
      domainNotFound: count("DOMAIN_NOT_FOUND"),
      mailboxFull: count("MAILBOX_FULL"),
      blocked: count("BLOCKED"),
      temporaryFailure: count("TEMPORARY_FAILURE"),
      successRate: total ? Math.round((successful / total) * 1000) / 10 : 0,
      failureRate: total ? Math.round((failed / total) * 1000) / 10 : 0,
      today: list.filter((r) => new Date(r.created_at).getTime() >= startOfDay.getTime()).length,
      thisMonth: list.filter((r) => new Date(r.created_at).getTime() >= startOfMonth.getTime()).length,
    };
  });
