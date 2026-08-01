import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  is_active: boolean;
  role: "admin" | "volunteer";
  created_at: string;
  last_login: string | null;
  delivered_count: number;
  failed_count: number;
  total_sent: number;
};


async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await assertAdmin(context);
    const { supabase } = context;
    const [profRes, rolesRes, mailsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("email_messages").select("user_id, status"),
    ]);
    if (profRes.error) throw new Error(profRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (mailsRes.error) throw new Error(mailsRes.error.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    const countsByUser = new Map<string, { delivered: number; failed: number }>();
    for (const m of (mailsRes.data ?? []) as Array<{ user_id: string; status: string }>) {
      const entry = countsByUser.get(m.user_id) ?? { delivered: 0, failed: 0 };
      if (m.status === "SENT" || m.status === "DELIVERED_TO_SERVER") entry.delivered += 1;
      else entry.failed += 1;
      countsByUser.set(m.user_id, entry);
    }

    return (profRes.data ?? []).map((p: any) => {
      const rs = rolesByUser.get(p.id) ?? [];
      const role = rs.includes("admin") ? "admin" : "volunteer";
      const c = countsByUser.get(p.id) ?? { delivered: 0, failed: 0 };
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        avatar_url: p.avatar_url,
        is_active: p.is_active,
        role,
        created_at: p.created_at,
        last_login: p.last_login,
        delivered_count: c.delivered,
        failed_count: c.failed,
        total_sent: c.delivered + c.failed,
      } as AdminUser;
    });
  });


const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "volunteer"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

const setActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setActiveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type EmailLogRow = {
  id: string;
  sent_at: string;
  status: string;
  template_type: string | null;
  subject: string;
  recipient_email: string;
  recipient_name: string | null;
  sender_email: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  error_message: string | null;
};

export type EmailStats = {
  total: number;
  success: number;
  failed: number;
  today: number;
  last7Days: number;
  byUser: Array<{ user_id: string; name: string | null; email: string | null; sent: number }>;
  byTemplate: Array<{ template: string; sent: number }>;
  recent: EmailLogRow[];
};

const SUCCESS_STATUSES = new Set(["SENT", "DELIVERED_TO_SERVER"]);

export const getEmailStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailStats> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });

    let logsQuery = supabase
      .from("email_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!isAdmin) logsQuery = logsQuery.eq("user_id", userId);
    const { data: logs, error } = await logsQuery;
    if (error) throw new Error(error.message);

    const rows = (logs ?? []) as any[];
    const total = rows.length;
    const success = rows.filter((r) => SUCCESS_STATUSES.has(r.status)).length;
    const failed = total - success;
    const now = Date.now();
    const dayMs = 86400_000;
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const today = rows.filter((r) => new Date(r.created_at).getTime() >= startOfToday.getTime()).length;
    const last7Days = rows.filter((r) => now - new Date(r.created_at).getTime() <= 7 * dayMs).length;

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const profilesMap = new Map<string, { name: string | null; email: string | null }>();
    if (userIds.length && isAdmin) {
      const { data: profs } = await supabase.from("profiles").select("id,name,email").in("id", userIds);
      for (const p of profs ?? []) profilesMap.set(p.id, { name: p.name, email: p.email });
    }

    const byUserMap = new Map<string, number>();
    for (const r of rows) {
      if (!SUCCESS_STATUSES.has(r.status)) continue;
      byUserMap.set(r.user_id, (byUserMap.get(r.user_id) ?? 0) + 1);
    }
    const byUser = Array.from(byUserMap.entries())
      .map(([user_id, sent]) => ({
        user_id,
        name: profilesMap.get(user_id)?.name ?? null,
        email: profilesMap.get(user_id)?.email ?? null,
        sent,
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 10);

    const byTemplateMap = new Map<string, number>();
    for (const r of rows) {
      if (!SUCCESS_STATUSES.has(r.status)) continue;
      const key = r.template_type ?? "unknown";
      byTemplateMap.set(key, (byTemplateMap.get(key) ?? 0) + 1);
    }
    const byTemplate = Array.from(byTemplateMap.entries())
      .map(([template, sent]) => ({ template, sent }))
      .sort((a, b) => b.sent - a.sent);

    const recent: EmailLogRow[] = rows.slice(0, 50).map((r) => ({
      id: r.id,
      sent_at: r.created_at,
      status: r.status,
      template_type: r.template_type,
      subject: r.subject,
      recipient_email: r.recipient_email,
      recipient_name: r.recipient_name,
      sender_email: r.sender_email,
      user_id: r.user_id,
      user_name: profilesMap.get(r.user_id)?.name ?? null,
      user_email: profilesMap.get(r.user_id)?.email ?? null,
      error_message: r.failure_reason,
    }));

    return { total, success, failed, today, last7Days, byUser, byTemplate, recent };
  });
