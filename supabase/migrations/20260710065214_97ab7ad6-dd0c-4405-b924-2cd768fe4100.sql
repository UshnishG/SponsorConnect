-- Restrict SECURITY DEFINER function exposure
-- 1) has_role: must remain SECURITY DEFINER (reads user_roles under RLS) but revoke from anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) today_send_count: switch to SECURITY INVOKER — email_messages RLS already
-- restricts users to their own rows, so definer privileges are unnecessary.
CREATE OR REPLACE FUNCTION public.today_send_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::INTEGER FROM public.email_messages
  WHERE user_id = _user_id
    AND status IN ('SENT', 'DELIVERED_TO_SERVER')
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$function$;

REVOKE ALL ON FUNCTION public.today_send_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.today_send_count(uuid) TO authenticated, service_role;

-- 3) user_roles: consolidate duplicate admin write policies (defense-in-depth cleanup)
DROP POLICY IF EXISTS "Admins insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete user_roles" ON public.user_roles;
-- Kept: "Admins can insert roles", "Admins can update roles", "Admins can delete roles",
-- and "Users view own roles" (SELECT).