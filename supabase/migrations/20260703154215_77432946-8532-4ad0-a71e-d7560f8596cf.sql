
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.today_send_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.email_logs
  WHERE user_id = _user_id AND status = 'success'
    AND sent_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon, service_role;

REVOKE ALL ON FUNCTION public.today_send_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.today_send_count(uuid) TO authenticated, service_role;
